const { API_BASE_URL } = require('../../utils/config')

const QUICK_MAX_EDGE = 1200

Page({
  data: {
    sourcePath: '',
    resultPath: '',
    scanMode: 'quick',
    filterMode: 'color',
    loading: false,
    canvasWidth: 1,
    canvasHeight: 1
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: ({ tempFiles }) => {
        this.setData({
          sourcePath: tempFiles[0].tempFilePath,
          resultPath: '',
          scanMode: 'quick'
        })
      }
    })
  },

  setScanMode(e) {
    this.setData({ scanMode: e.currentTarget.dataset.mode })
  },

  setFilterMode(e) {
    this.setData({ filterMode: e.currentTarget.dataset.mode })
  },

  handlePrimary() {
    if (!this.data.sourcePath) {
      this.chooseImage()
      return
    }

    if (this.data.scanMode === 'smart') {
      this.smartOptimize()
      return
    }

    this.quickScan()
  },

  quickScan() {
    if (!this.data.sourcePath || this.data.loading) return
    this.setData({ loading: true })

    wx.getImageInfo({
      src: this.data.sourcePath,
      success: ({ width, height }) => {
        const scale = Math.min(1, QUICK_MAX_EDGE / Math.max(width, height))
        const canvasWidth = Math.max(1, Math.round(width * scale))
        const canvasHeight = Math.max(1, Math.round(height * scale))

        this.setData({ canvasWidth, canvasHeight }, () => {
          const ctx = wx.createCanvasContext('quickCanvas', this)
          ctx.drawImage(this.data.sourcePath, 0, 0, canvasWidth, canvasHeight)
          ctx.draw(false, () => {
            this.processQuickCanvas(canvasWidth, canvasHeight)
          })
        })
      },
      fail: () => {
        this.setData({ loading: false })
        wx.showToast({ title: '读取图片失败', icon: 'none' })
      }
    })
  },

  processQuickCanvas(width, height) {
    wx.canvasGetImageData({
      canvasId: 'quickCanvas',
      x: 0,
      y: 0,
      width,
      height,
      success: ({ data }) => {
        const pixels = new Uint8ClampedArray(data)
        const enhanced = this.enhancePixels(pixels, width, height, this.data.filterMode)

        wx.canvasPutImageData({
          canvasId: 'quickCanvas',
          x: 0,
          y: 0,
          width,
          height,
          data: enhanced,
          success: () => this.exportQuickCanvas(width, height),
          fail: () => this.quickScanFailed('处理图片失败')
        }, this)
      },
      fail: () => this.quickScanFailed('读取像素失败')
    }, this)
  },

  enhancePixels(data, width, height, filterMode) {
    const output = new Uint8ClampedArray(data.length)
    const contrast = 1.12
    const brightness = 8
    const clamp = value => Math.max(0, Math.min(255, value))

    for (let i = 0; i < data.length; i += 4) {
      let r = clamp((data[i] - 128) * contrast + 128 + brightness)
      let g = clamp((data[i + 1] - 128) * contrast + 128 + brightness)
      let b = clamp((data[i + 2] - 128) * contrast + 128 + brightness)

      if (filterMode === 'bw') {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b
        const value = gray > 168 ? 255 : (gray < 92 ? 0 : gray)
        r = value
        g = value
        b = value
      }

      output[i] = r
      output[i + 1] = g
      output[i + 2] = b
      output[i + 3] = data[i + 3]
    }

    // 轻量锐化：中心像素增强，避免在手机端执行高成本卷积。
    if (width > 2 && height > 2) {
      const source = new Uint8ClampedArray(output)
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const i = (y * width + x) * 4
          const left = i - 4
          const right = i + 4
          const up = i - width * 4
          const down = i + width * 4

          for (let c = 0; c < 3; c += 1) {
            const sharpened = source[i + c] * 3
              - source[left + c] * 0.5
              - source[right + c] * 0.5
              - source[up + c] * 0.5
              - source[down + c] * 0.5
            output[i + c] = clamp(sharpened)
          }
        }
      }
    }

    return output
  },

  exportQuickCanvas(width, height) {
    wx.canvasToTempFilePath({
      canvasId: 'quickCanvas',
      x: 0,
      y: 0,
      width,
      height,
      destWidth: width,
      destHeight: height,
      fileType: 'jpg',
      quality: 0.92,
      success: ({ tempFilePath }) => {
        this.setData({ resultPath: tempFilePath, loading: false })
        wx.showToast({ title: '快速扫描完成', icon: 'success' })
      },
      fail: () => this.quickScanFailed('生成扫描结果失败')
    }, this)
  },

  quickScanFailed(message) {
    this.setData({ loading: false })
    wx.showToast({ title: message, icon: 'none' })
  },

  smartOptimize() {
    if (!this.data.sourcePath || this.data.loading) return
    this.setData({ loading: true })

    wx.uploadFile({
      url: `${API_BASE_URL}/api/scan?mode=${this.data.filterMode}`,
      filePath: this.data.sourcePath,
      name: 'file',
      success: (res) => {
        if (res.statusCode !== 200) {
          wx.showToast({ title: '智能优化失败', icon: 'none' })
          return
        }

        let data
        try {
          data = JSON.parse(res.data)
        } catch (error) {
          wx.showToast({ title: '返回数据异常', icon: 'none' })
          return
        }

        if (!data.result_url) {
          wx.showToast({ title: '没有扫描结果', icon: 'none' })
          return
        }

        this.setData({ resultPath: `${API_BASE_URL}${data.result_url}` })

        if (!data.detected) {
          wx.showToast({ title: '未识别到完整纸张边缘', icon: 'none' })
        }
      },
      fail: () => wx.showToast({ title: '无法连接智能优化服务', icon: 'none' }),
      complete: () => this.setData({ loading: false })
    })
  }
})

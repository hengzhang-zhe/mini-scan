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
        this.setData({ sourcePath: tempFiles[0].tempFilePath, resultPath: '', scanMode: 'quick' })
      }
    })
  },

  setScanMode(e) { this.setData({ scanMode: e.currentTarget.dataset.mode }) },
  setFilterMode(e) { this.setData({ filterMode: e.currentTarget.dataset.mode }) },

  handlePrimary() {
    if (!this.data.sourcePath) return this.chooseImage()
    if (this.data.scanMode === 'smart') return this.smartOptimize()
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
          ctx.draw(false, () => this.processQuickCanvas(canvasWidth, canvasHeight))
        })
      },
      fail: () => this.quickScanFailed('读取图片失败')
    })
  },

  processQuickCanvas(width, height) {
    wx.canvasGetImageData({
      canvasId: 'quickCanvas', x: 0, y: 0, width, height,
      success: ({ data }) => {
        const pixels = new Uint8ClampedArray(data)
        const crop = this.detectDocumentBounds(pixels, width, height)
        const enhanced = this.enhancePixels(pixels, width, height, this.data.filterMode)
        wx.canvasPutImageData({
          canvasId: 'quickCanvas', x: 0, y: 0, width, height, data: enhanced,
          success: () => this.exportQuickCanvas(width, height, crop),
          fail: () => this.quickScanFailed('处理图片失败')
        }, this)
      },
      fail: () => this.quickScanFailed('读取像素失败')
    }, this)
  },

  detectDocumentBounds(data, width, height) {
    // 快速模式采用低成本矩形边界估计：从四周向内寻找明显的亮度/纹理变化。
    // 它适合纸张与桌面有一定反差的普通拍摄；复杂场景交给智能优化。
    const step = Math.max(2, Math.round(Math.max(width, height) / 400))
    const marginX = Math.round(width * 0.03)
    const marginY = Math.round(height * 0.03)
    const grayAt = (x, y) => {
      const i = (y * width + x) * 4
      return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    }
    const rowScore = y => {
      let score = 0, count = 0
      for (let x = marginX; x < width - marginX - step; x += step) {
        score += Math.abs(grayAt(x, y) - grayAt(x + step, y)); count++
      }
      return count ? score / count : 0
    }
    const colScore = x => {
      let score = 0, count = 0
      for (let y = marginY; y < height - marginY - step; y += step) {
        score += Math.abs(grayAt(x, y) - grayAt(x, y + step)); count++
      }
      return count ? score / count : 0
    }

    const threshold = 9
    let left = marginX, right = width - marginX, top = marginY, bottom = height - marginY
    for (let x = marginX; x < width * 0.45; x += step) if (colScore(x) > threshold) { left = x; break }
    for (let x = width - marginX - 1; x > width * 0.55; x -= step) if (colScore(x) > threshold) { right = x; break }
    for (let y = marginY; y < height * 0.45; y += step) if (rowScore(y) > threshold) { top = y; break }
    for (let y = height - marginY - 1; y > height * 0.55; y -= step) if (rowScore(y) > threshold) { bottom = y; break }

    const pad = Math.round(Math.min(width, height) * 0.012)
    left = Math.max(0, left - pad); top = Math.max(0, top - pad)
    right = Math.min(width, right + pad); bottom = Math.min(height, bottom + pad)

    const cropWidth = right - left
    const cropHeight = bottom - top
    const areaRatio = (cropWidth * cropHeight) / (width * height)
    if (cropWidth < width * 0.45 || cropHeight < height * 0.45 || areaRatio < 0.28) {
      return { x: 0, y: 0, width, height, detected: false }
    }
    return { x: left, y: top, width: cropWidth, height: cropHeight, detected: true }
  },

  enhancePixels(data, width, height, filterMode) {
    const output = new Uint8ClampedArray(data.length)
    const contrast = 1.12, brightness = 8
    const clamp = value => Math.max(0, Math.min(255, value))
    for (let i = 0; i < data.length; i += 4) {
      let r = clamp((data[i] - 128) * contrast + 136)
      let g = clamp((data[i + 1] - 128) * contrast + 136)
      let b = clamp((data[i + 2] - 128) * contrast + 136)
      if (filterMode === 'bw') {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b
        const value = gray > 168 ? 255 : (gray < 92 ? 0 : gray)
        r = value; g = value; b = value
      }
      output[i] = r; output[i + 1] = g; output[i + 2] = b; output[i + 3] = data[i + 3]
    }
    if (width > 2 && height > 2) {
      const source = new Uint8ClampedArray(output)
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4
        const left = i - 4, right = i + 4, up = i - width * 4, down = i + width * 4
        for (let c = 0; c < 3; c++) output[i + c] = clamp(source[i + c] * 3 - source[left + c] * .5 - source[right + c] * .5 - source[up + c] * .5 - source[down + c] * .5)
      }
    }
    return output
  },

  exportQuickCanvas(width, height, crop) {
    wx.canvasToTempFilePath({
      canvasId: 'quickCanvas', x: crop.x, y: crop.y, width: crop.width, height: crop.height,
      destWidth: crop.width, destHeight: crop.height, fileType: 'jpg', quality: 0.92,
      success: ({ tempFilePath }) => {
        this.setData({ resultPath: tempFilePath, loading: false })
        wx.showToast({ title: crop.detected ? '已自动裁边' : '快速扫描完成', icon: 'success' })
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
      filePath: this.data.sourcePath, name: 'file',
      success: (res) => {
        if (res.statusCode !== 200) return wx.showToast({ title: '智能优化失败', icon: 'none' })
        let data
        try { data = JSON.parse(res.data) } catch (error) { return wx.showToast({ title: '返回数据异常', icon: 'none' }) }
        if (!data.result_url) return wx.showToast({ title: '没有扫描结果', icon: 'none' })
        this.setData({ resultPath: `${API_BASE_URL}${data.result_url}` })
        if (!data.detected) wx.showToast({ title: '未识别到完整纸张边缘', icon: 'none' })
      },
      fail: () => wx.showToast({ title: '无法连接智能优化服务', icon: 'none' }),
      complete: () => this.setData({ loading: false })
    })
  }
})

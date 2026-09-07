const { API_BASE_URL } = require('../../utils/config')

Page({
  data: {
    sourcePath: '',
    resultPath: '',
    scanMode: 'quick',
    filterMode: 'color',
    loading: false
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

    // 第一版快速扫描先建立本地处理入口。
    // 后续在这里逐步加入：自动裁边、轻度透视、旋转、亮度/对比度、锐化、灰度/黑白、简单去噪。
    // 当前先保留原图预览，确保快速模式不依赖后端。
    this.setData({ resultPath: this.data.sourcePath })
    wx.showToast({ title: '快速扫描完成', icon: 'success' })
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

        this.setData({
          resultPath: `${API_BASE_URL}${data.result_url}`
        })

        if (!data.detected) {
          wx.showToast({ title: '未识别到完整纸张边缘', icon: 'none' })
        }
      },
      fail: () => wx.showToast({ title: '无法连接智能优化服务', icon: 'none' }),
      complete: () => this.setData({ loading: false })
    })
  }
})

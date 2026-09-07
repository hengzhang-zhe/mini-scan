const { API_BASE_URL } = require('../../utils/config')

Page({
  data: {
    sourcePath: '',
    resultPath: '',
    mode: 'color',
    loading: false
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: ({ tempFiles }) => {
        this.setData({ sourcePath: tempFiles[0].tempFilePath, resultPath: '' })
      }
    })
  },

  setMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode })
  },

  scan() {
    if (!this.data.sourcePath || this.data.loading) return
    this.setData({ loading: true })

    wx.uploadFile({
      url: `${API_BASE_URL}/api/scan?mode=${this.data.mode}`,
      filePath: this.data.sourcePath,
      name: 'file',
      success: (res) => {
        if (res.statusCode !== 200) {
          wx.showToast({ title: '扫描失败', icon: 'none' })
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
      fail: () => wx.showToast({ title: '无法连接扫描服务', icon: 'none' }),
      complete: () => this.setData({ loading: false })
    })
  }
})

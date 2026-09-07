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
        const fs = wx.getFileSystemManager()
        const output = `${wx.env.USER_DATA_PATH}/scan-${Date.now()}.jpg`
        fs.writeFile({
          filePath: output,
          data: res.data,
          encoding: 'binary',
          success: () => this.setData({ resultPath: output }),
          fail: () => wx.showToast({ title: '保存结果失败', icon: 'none' })
        })
      },
      fail: () => wx.showToast({ title: '无法连接扫描服务', icon: 'none' }),
      complete: () => this.setData({ loading: false })
    })
  }
})

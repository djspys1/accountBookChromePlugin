new Vue({
  el: '#app',
  data: {
    data: [],
    errMessage: '', // 错误信息
    DB: null, // indexdDb
    dbName: 'accountBook',
    tableName: 'account',
    version: 1,
    addType: 1, // 数据添加方式 1手动输入 2文本上传 3获取
    isLock: false, // 防止重复
    currentType: '', // 当前显示的币种 默认所有
    dealFor: {}, // 提交至indexdDb的数据
    priceType: null, // 当前显示的方向 1:买入 2卖出 0所有
    priceTypes: [
      {
        name: '所有',
        direction: 0,
      },
      {
        name: '买入',
        direction: 1,
      },
      {
        name: '卖出',
        direction: 2,
      },
    ],
    currencyLists: ['所有']
  },
  created() {
    this.priceType = this.priceTypes[0]
    this.currentType = this.currencyLists[0]
    math.config({
      number: 'BigNumber'
    });
    this.init()
    this.connectDb()
  },
  filters: {
    priceNumber: function (value) {
      if (!value) return 0
      return Number(value).toFixed(2)
    }
  },
  computed: {
    lists() {
      let list = this.data
      if (this.priceType.direction) {
        list = list.filter(item => item.direction === this.priceType.direction)
      }
      if (this.currentType && this.currentType !== '所有') {
        list = list.filter(item => item.type === this.currentType)
      }

      return list
    },
    showMore() {
      if (this.currentType === '所有' && this.priceType.direction === 0) {
        // buyTotalPrice sellTotalPrice profit
        return ['buyTotalPrice', 'sellTotalPrice', 'profit']
      }
      if (this.currentType === '所有' && this.priceType.direction === 1) {
        // buyTotalPrice
        return ['buyTotalPrice']
      }
      if (this.currentType === '所有' && this.priceType.direction === 2) {
        // sellTotalPrice
        return ['sellTotalPrice']
      }
      if (this.currentType !== '所有' && this.priceType.direction === 0) {
        // buyTotalPrice buyTotalAmount sellTotalPrice sellTotalAmount currentAmount currentAveragePrice
        return ['buyTotalPrice', 'buyTotalAmount', 'sellTotalPrice', 'sellTotalAmount', 'currentAmount', 'currentAveragePrice']
      }
      if (this.currentType !== '所有' && this.priceType.direction === 1) {
        // buyTotalPrice buyTotalAmount buyAveragePrice
        return ['buyTotalPrice', 'buyTotalAmount', 'buyAveragePrice']
      }
      if (this.currentType !== '所有' && this.priceType.direction === 2) {
        // sellTotalPrice sellTotalAmount sellAveragePrice
        return ['sellTotalPrice', 'sellTotalAmount', 'sellAveragePrice']
      }
      return []
    },
    totalPrice() {
      const info = {
        buyTotalPrice: 0,
        sellTotalPrice: 0,
        currentAmount: 0,
        currentAveragePrice: 0,
        buyAveragePrice: 0,
        sellAveragePrice: 0,
        buyTotalAmount: 0,
        sellTotalAmount: 0,
        profit: 0,
      }
      const buy = this.lists.filter(item => item.direction === 1)
      const buyTotalPrice = buy.map(li => math.bignumber(li.total))

      if (buyTotalPrice.length > 1) {
        info.buyTotalPrice = math.add(...buyTotalPrice)
      } else {
        info.buyTotalPrice = buyTotalPrice.length === 1 ? buyTotalPrice[0] : 0
      }

      const buyTotalAmount = buy.map(li => math.bignumber(li.amount))

      if (buyTotalAmount.length > 1) {
        info.buyTotalAmount = math.add(...buyTotalAmount)
      } else {
        info.buyTotalAmount = buyTotalAmount.length === 1 ? buyTotalAmount[0] : 0
      }


      const sell = this.lists.filter(item => item.direction === 2)
      const sellTotalPrice = sell.map(li => math.bignumber(li.total))

      if (sellTotalPrice.length > 1) {
        info.sellTotalPrice = math.add(...sellTotalPrice)
      } else {
        info.sellTotalPrice = sellTotalPrice.length === 1 ? sellTotalPrice[0] : 0
      }

      const sellTotalAmount = sell.map(li => math.bignumber(li.amount))

      if (sellTotalAmount.length > 1) {
        info.sellTotalAmount = math.add(...sellTotalAmount)
      } else {
        info.sellTotalAmount = sellTotalAmount.length === 1 ? sellTotalAmount[0] : 0
      }

      info.currentAmount = math.subtract(math.bignumber(info.buyTotalAmount), info.sellTotalAmount)

      // （买入总价-卖出总价）/ （买入总数 - 卖出总数）
      const price = math.subtract(math.bignumber(info.buyTotalPrice), info.sellTotalPrice)
      const amount = math.subtract(math.bignumber(info.buyTotalAmount), info.sellTotalAmount)

      if (amount <= 0) {
        info.currentAveragePrice = 0
      } else {
        info.currentAveragePrice = math.divide(math.bignumber(price), amount)
      }

      info.buyAveragePrice = math.divide(math.bignumber(info.buyTotalPrice), info.buyTotalAmount)
      info.sellAveragePrice = math.divide(math.bignumber(info.sellTotalPrice), info.sellTotalAmount)
      info.profit = math.subtract(math.bignumber(info.sellTotalPrice), info.buyTotalPrice)

      return info
    }
  },
  watch: {
    currencyLists: {
      handler: function(newVal, oldVal) {
        if (!newVal.includes(this.currentType)) {
          this.currentType = newVal[0]
        }
      },
      deep: true
    },
    errMessage: function (val, oldVal) {
      if (val) {
        setTimeout(() => {
          this.errMessage = ''
        }, 1000 * 2)
      }
    },
  },
  methods: {
    init() {
      this.isLock = false
      this.dealFor = {
        amount: '',
        price: '',
        direction: 1,
        total: 0,
        key: '',
        type: ''
      }
    },
    connectDb() {
      const request = window.indexedDB.open(this.dbName, this.version)
      request.onerror = () => {
        this.errMessage = '数据库打开报错'
      };
      request.onsuccess = () => {
        this.DB = request.result;
        this.get()
      };
      request.onupgradeneeded = () => {
        this.DB = request.result;
        let objectStore;
        if (!this.DB.objectStoreNames.contains(this.tableName)) {
          objectStore = this.DB.createObjectStore(this.tableName, {keyPath: 'key'});
        }
      }
    },
    add() {
      if (this.isLock) {
        this.errMessage = '请勿快速点击'
        return !1
      }
      if (!this.dealFor.price || !this.dealFor.amount) {
        this.errMessage = '价格或数量不得为0'
        return !1
      }
      if (!this.dealFor.type) {
        this.errMessage = '请输入币种'
        return !1
      }


      this.isLock = true
      this.dealFor.total = math.number(math.multiply(Number(this.dealFor.amount), math.bignumber(Number(this.dealFor.price))))
      this.dealFor.key = String((new Date()).valueOf())
      const request = this.DB.transaction([this.tableName], 'readwrite')
        .objectStore(this.tableName)
        .add(this.dealFor);

      request.onsuccess = () => {
        this.get()
        this.isLock = false
        this.dealFor.amount = ''
        this.dealFor.price = ''
        this.dealFor.total = 0
        this.dealFor.key = ''
      };

      request.onerror = () => {
        this.isLock = false
        this.errMessage = '添加失败'
      }
    },
    get() {
      const request = this.DB.transaction([this.tableName], 'readonly')
        .objectStore(this.tableName).getAll();

      request.onsuccess = () => {
        this.data = request.result
        this.currencyLists= ['所有']
        const list = this.data.filter(li => li.type).map(item => item.type)
        this.currencyLists = [...new Set(this.currencyLists.concat(list))]
      };

      request.onerror = () => {
        this.errMessage = '获取记录失败'
      }
    },

    deleteItem(item) {
      const request = this.DB.transaction([this.tableName], 'readwrite')
        .objectStore(this.tableName).delete(item.key);

      request.onsuccess = () => {
        this.get()
        this.errMessage = '删除成功'
      };

      request.onerror = () => {
        this.errMessage = '删除失败'
      }
    },
    getColor(data) {
      if (data.direction === 1) {
        return 'green'
      }

      return 'red'
    },
    changePriceType(data) {
      this.priceType = data
    },
    changeCurrentType(data) {
      this.currentType = data
    },
    addByTextFile(items) {
      const transaction = this.DB.transaction([this.tableName], 'readwrite')
      const request = transaction.objectStore(this.tableName);
      const aa = items.filter(item => item.split(/[\s]/).length > 5)
      for (const [index, i] of aa.entries()) {
        const data = i.split(/[\s]/)
        if (data && data.length > 5) {
          const list = {
            type: data[0].toLowerCase(),
            direction: data[1] === 'BUY' ? 1 : 2,
            amount: data[2],
            price: data[3],
            total: data[4],
            key: String((new Date(`${data[5]} ${data[6]}`)).valueOf()) + index
          }

          request.add(list)

          request.onsuccess = () => {
          };

          request.onerror = function (event) {
          }
        }
      }

      transaction.oncomplete = () => {
        this.get()
        this.errMessage = '已上传'
      }
    },
    changeAddType() {
      this.addType = this.addType === 3 ? 1 : this.addType + 1
    },
    jsReadFiles(event) {
      const files = event.target.files
      if (files.length) {
        const file = files[0];
        const reader = new FileReader();//new一个FileReader实例
        if (/text+/.test(file.type)) {
          reader.readAsText(file,'utf8');
          reader.onload = () =>{
            const lists = reader.result.split(/[\n]/)
            if (lists && lists.length) {

              this.addByTextFile(lists)
            }
          }
        }
      }
    }
  },
  destroyed() {
    this.DB.close()
  }
})
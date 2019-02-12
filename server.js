const Server = require('logux-server').Server

const app = new Server(
  Server.loadOptions(process, {
    subprotocol: '1.0.0',
    supports: '1.x',
    root: __dirname
  })
)

app.auth((userId, token) => {
  // TODO Check token and return a Promise with true or false.
	return Promise.resolve(true)
})

class User {
	constructor ({ id, name }) {
		this.id = id
		this.name = name
	}

	update ({ name }) {
		this.name = name
	}
}

class Users extends Array {
  find ({ id }) {
    return new Promise((resolve, reject) => {
      const candidates = users.filter(user => user.id === id)
      if (candidates.length > 0) {
        resolve(candidates[0])
      } else {
        reject(new Error('Not found'))
      }
    })
  }
}

const users = new Users()
users.push(new User({ id: 1, name: 'Jim' }))
users.push(new User({ id: 2, name: 'Sheldon' }))

app.channel('clicks', (params, action, meta, creator) => {
  return true
})

app.type('click', {
  access (action, meta, creator) {
    console.log('Jim click1', action, meta, creator)
    return true
  },
  process (action) {
    console.log('Jim click2', action)
  }
})

app.listen()

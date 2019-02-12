import classes from './index.css'
import { html, render } from 'lit-html'
import CrossTabClient from 'logux-client/cross-tab-client'
import nanostate from 'nanostate'
import delay from 'delay'

const states = {
  off: {
    leader: 'starting',
    notLeader: 'off',
    stopped: 'off'
  },
  starting: {
    leader: 'starting',
    notLeader: 'stopping',
    started: 'on'
  },
  on: {
    leader: 'on',
    notLeader: 'stopping'
  },
  stopping: {
    leader: 'restartAfterShutdown',
    notLeader: 'stopping',
    stopped: 'off'
  },
  restartAfterShutdown: {
    stopped: 'starting',
    leader: 'restartAfterShutdown',
    notLeader: 'stopping'
  }
}
const machine = nanostate('off', states)
Object.keys(states).forEach(state => {
  machine.on(state, () => {
    console.log('New State:', state)
    r()
  })
})

machine.on('starting', async () => {
  await delay(3000)
  machine.emit('started')
})

machine.on('stopping', async () => {
  await delay(3000)
  machine.emit('stopped')
})


const fakeServer = {
  on: () => {},
  connect: () => {}  
}

class LoguxWrapper {
  constructor () {
    this.startLogux()
  }

  startLogux () {
    this.logux = new CrossTabClient({
      credentials: '',
      subprotocol: '1.0.0',
      server: fakeServer,
      userId: 1
    })
    this.logux.start()
    this.logux.log.add(
      { type: 'logux/subscribe', channel: 'clicks' },
      { sync: true }
    )
    this.unbindAddListener = this.logux.on('add', this.addHandler.bind(this))
    this.unbindRoleListener = this.logux.on('role', this.roleHandler.bind(this))
  }

  async restart () {
    if (!this.logux) return
    machine.emit('notLeader')
    this.unbindAddListener()
    this.unbindRoleListener()
    try {
      this.logux.destroy()
    } catch (err) {
      // console.error('Error', err)
    }
    this.logux = null
    await delay(1000)
    this.startLogux()
  }

  addHandler (action, meta) {
    if (action.type === 'click') {
      events.push(meta)
      r()
    }
  }

  roleHandler () {
    if (!this.logux) return
    const { role } = this.logux
    console.log('New role:', role)
    if (role === 'leader') {
      machine.emit('leader')
    } else {
      machine.emit('notLeader')
    }
  }

}

const wrapper = new LoguxWrapper()

const events = []

function r () {
  const { logux } = wrapper
  const page = html`
    <h1>Logux + PeerPad Test</>
    <p>${new Date().toLocaleString()}</p>
    <p>ID: ${logux && logux.id}</p>
    <p>Role: ${logux && logux.role}</p>
    <p>State: ${machine.state}</p>
    <div>
      <button @click=${click}>Log me!</button>
      ${logux && logux.role === 'leader' ?
        html`<button @click=${resign}>Resign</button>` : ''}
    </div>
    <h3>Log</h3>
    ${events.map(event => html`<div>${
      event.id[1] + ' ' + event.added + ' ' + event.time
    }</div>`)}
  `
  render(page, document.body)

  function click () {
    if (!logux) return
    logux.log.add({ type: 'click' }, {
      reasons: ['click'],
      channels: ['clicks'],
      sync: true
    })
  }

  async function resign () {
    console.log('Resign')
    await wrapper.restart()
  }    
}

r()
setInterval(r, 1000)


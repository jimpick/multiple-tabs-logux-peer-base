import classes from './index.css'
import { html, render } from 'lit-html'
import CrossTabClient from 'logux-client/cross-tab-client'
import nanostate from 'nanostate'
import delay from 'delay'
import PeerBase from 'peer-base'
import EventEmitter from 'events'
import { Set } from 'immutable'

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

let lights

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
    this.logux.log.add(
      { type: 'logux/subscribe', channel: 'peerBase' },
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
      events.push({ ...meta, click: true })
      r()
    }
    if (action.type === 'updateSet') {
      lights = new Set(action.lights)
      console.log('Jim updateSet', [...lights.toJS().values()])
      events.push({ ...meta, lights })
      r()
    }
    if (action.type === 'requestUpdate' && this.logux.role === 'leader') {
      console.log('Jim requestUpdate received')
      this.logux.log.add(
        {
          type: 'updateSet',
          lights: [...lights.toJS().values()],
        },
        {
          reasons: ['update'],
          channels: ['peerBase'],
          sync: true
        }
      )
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
if (wrapper.logux.role === 'follower') {
  console.log('Requesting update...')
  wrapper.logux.log.add(
    { type: 'requestUpdate' },
    {
      reasons: ['update'],
      channels: ['peerBase'],
      sync: true
    }
  )
}

class PeerBaseContainer extends EventEmitter {
  constructor () {
    super()
    this.stateChanged = this.stateChanged.bind(this)
  }
  async start () {
    if (this.app || this.collaboration) return
    console.log('Starting peer-base...')  
    this.app = PeerBase('lights-demo-2', {
      ipfs: {
        swarm: ['/dns4/rendezvous.jimpick.com/tcp/9091/wss/p2p-websocket-star'],
        bootstrap: [
          '/dns4/ams-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd',
          '/dns4/lon-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLMeWqB7YGVLJN3pNLQpmmEk35v6wYtsMGLzSr5QBU3',
          '/dns4/sfo-3.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLPppuBtQSGwKDZT2M73ULpjvfd3aZ6ha4oFGL1KrGM',
          '/dns4/sgp-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLSafTMBsPKadTEgaXctDQVcqN88CNLHXMkTNwMKPnu',
          '/dns4/nyc-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLueR4xBeUbY9WZ9xGUUxunbKWcrNFTDAadQJmocnWm',
          '/dns4/nyc-2.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLV4Bbm51jM9C4gDYZQ9Cy3U6aXMJDAbzgu2fzaDs64',
          '/dns4/node0.preload.ipfs.io/tcp/443/wss/ipfs/QmZMxNdpMkewiVZLMRxaNxUeZpDUb34pWjZ1kZvsd16Zic',
          '/dns4/node1.preload.ipfs.io/tcp/443/wss/ipfs/Qmbut9Ywz9YEDrz8ySBSgWyJk41Uvm2QJPhwDJzJyGFsD6'
        ]
      }
    })
    await this.app.start()
    this.id = (await this.app.ipfs.id()).id
    this.collaboration = await this.app.collaborate('lights', 'rwlwwset')
    this.collaboration.on('state changed', this.stateChanged)
    this.stateChanged()
    console.log('Started')
  }

  async stop () {
    console.log('Stopping peer-base...')
    this.collaboration.removeListener('state changed', this.stateChanged)
    await this.collaboration.stop()
    this.collaboration = null
    await this.app.stop()
    this.app = null
    console.log('Stopped')
  }

  stateChanged () {
    console.log('Jim state changed', this.collaboration.shared.value())
    this.emit('state changed', this.collaboration.shared.value())
  }
}

const peerBaseContainer = new PeerBaseContainer()
peerBaseContainer.on('state changed', value => {
  console.log('Jim2 state changed', value)
  const { logux } = wrapper
  if (!logux) return
  logux.log.add(
    {
      type: 'updateSet',
      lights: [...value.values()],
    },
    {
      reasons: ['update'],
      channels: ['peerBase'],
      sync: true
    }
  )
})

machine.on('starting', async () => {
  await peerBaseContainer.start()
  machine.emit('started')
})

machine.on('stopping', async () => {
  await peerBaseContainer.stop()
  machine.emit('stopped')
})

const events = []

function r () {
  const { logux } = wrapper
  const lightsEl = lights ?
    (
      html`<ul>
        ${lights.map(light => html`<li>${light}</li>`)}
      </ul>`
    ) :
    html`<div>Loading...</div>`
  const page = html`
    <h1>Logux + PeerBase Test</h1>
    <div>${new Date().toLocaleString()}</div>
    <div>ID: ${logux && logux.id}</div>
    <div>Role: ${logux && logux.role}</div>
    ${
      logux && logux.role === 'leader' ?
      html`<div>Peer ID: ${peerBaseContainer.id}</div>` :
      ''
    }
    </div>
    <div>State: ${machine.state}</div>
    <div>
      <button @click=${click}>Log me!</button>
      ${logux && logux.role === 'leader' ?
        html`<button @click=${resign}>Resign</button>` : ''}
    </div>
    <h3>Lights</h3>
    ${lightsEl}
    <h3>Log</h3>
    ${events.map(event => html`<div>${
      event.id[1] + ' ' + event.added + ' ' + event.time + ': ' +
      (event.click ? '[click]' : '') +
      (event.lights ? event.lights.toJS().join(' ') : '')
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


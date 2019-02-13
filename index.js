import 'setimmediate' // Needed for Firefox
import classes from './index.css'
import { html, render } from 'lit-html'
import CrossTabClient from 'logux-client/cross-tab-client'
import nanostate from 'nanostate'
import delay from 'delay'
import PeerBase from 'peer-base'
import EventEmitter from 'events'
import { OrderedSet } from 'immutable'

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
    rerender()
  })
})

let pendingPins
let pinnedPins

const fakeServer = {
  on: () => {},
  connect: () => {}  
}

class LoguxWrapper extends EventEmitter {
  constructor () {
    super()
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
      rerender()
    }
    if (action.type === 'updateSet') {
      if (action.pendingPins) {
        pendingPins = new OrderedSet(action.pendingPins.sort())
        console.log('Jim updateSet pending', [...pendingPins.toJS().values()])
        events.push({ ...meta, pendingPins })
      }
      if (action.pinnedPins) {
        pinnedPins = new OrderedSet(action.pinnedPins.sort())
        console.log('Jim updateSet pinned', [...pinnedPins.toJS().values()])
        events.push({ ...meta, pinnedPins })
      }
      this.emit('updated')
    }
    if (action.type === 'requestUpdate' && this.logux.role === 'leader') {
      console.log('Jim requestUpdate received')
      this.logux.log.add(
        {
          type: 'updateSet',
          pendingPins: [...pendingPins.toJS().values()],
          pinnedPins: [...pinnedPins.toJS().values()]
        },
        {
          reasons: ['update'],
          channels: ['peerBase'],
          sync: true
        }
      )
    }
    if (action.type === 'requestPending' && this.logux.role === 'leader') {
      console.log('Jim requestPending received', action.cid)
      this.emit('requestPending', action.cid)
    }
    if (action.type === 'requestRemove' && this.logux.role === 'leader') {
      console.log('Jim requestRemove received', action.cid)
      this.emit('requestRemove', action.cid)
    }
    if (action.type === 'requestPin' && this.logux.role === 'leader') {
      console.log('Jim requestPin received', action.cid)
      this.emit('requestPin', action.cid)
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
wrapper.on('updated', rerender)
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

let parentPort

window.addEventListener('message', e => {
  const { data } = e
  if (data.type === 'setup') {
    console.log('Parent iframe connected')
    parentPort = e.ports[0]
    parentPort.postMessage({ type: 'setupAck' })
  }
  if (data.type === 'requestPending') {
    const { cid } = data
    console.log('Parent iframe requested to pin', cid)
    wrapper.logux.log.add(
      {
        type: 'requestPending',
        cid
      },
      {
        reasons: ['update'],
        channels: ['peerBase'],
        sync: true
      }
    )
    if (!parentPort) {
      throw new Error('Parent iframe not connected')
    }
    parentPort.postMessage({
      type: 'requestPendingReceived',
      cid
    })
    wrapper.on('updated', checkIfPinned)

    function checkIfPinned () {
      if (pinnedPins.has(cid)) {
        wrapper.removeListener('updated', checkIfPinned)
        parentPort.postMessage({
          type: 'pinned',
          cid
        })
      }
    }
  }
})

class PeerBaseContainer extends EventEmitter {
  constructor () {
    super()
    this.stateChangedPending = this.stateChangedPending.bind(this)
    this.stateChangedPinned = this.stateChangedPinned.bind(this)
  }
  async start () {
    if (this.app || this.collaboration) return
    console.log('Starting peer-base...')  
    this.app = PeerBase('simple-pinner-demo-1', {
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
    this.collaboration = await this.app.collaborate('pendingPins', 'rwlwwset')
    this.collaboration.on('state changed', this.stateChangedPending)
    this.pinnedPins = await this.collaboration.sub('pinnedPins', 'rwlwwset')
    this.pinnedPins.on('state changed', this.stateChangedPinned)
    this.stateChangedPending()
    this.stateChangedPinned()
    console.log('Started')
  }

  async stop () {
    console.log('Stopping peer-base...')
    this.collaboration.removeListener('state changed', this.stateChangedPending)
    this.pinnedPins.removeListener('state changed', this.stateChangedPinned)
    await this.collaboration.stop()
    this.collaboration = null
    this.pinnedPins = null
    await this.app.stop()
    this.app = null
    console.log('Stopped')
  }

  stateChangedPending () {
    console.log('Jim state changed pending', this.collaboration.shared.value())
    this.emit('state changed pending', this.collaboration.shared.value())
  }

  stateChangedPinned () {
    console.log('Jim state changed pinned', this.pinnedPins.shared.value())
    this.emit('state changed pinned', this.pinnedPins.shared.value())
  }

  pinPending (cid) {
    if (!this.collaboration) {
      throw new Error('Requested pinPending, but no collaboration')
    }
    this.collaboration.shared.add(Date.now(), cid)
  }

  pin (cid) {
    if (!this.collaboration) {
      throw new Error('Requested pin, but no collaboration')
    }
    this.pinnedPins.shared.add(Date.now(), cid)
    this.collaboration.shared.remove(Date.now(), cid)
  }

  remove (cid) {
    if (!this.collaboration) {
      throw new Error('Requested remove, but no collaboration')
    }
    this.collaboration.shared.remove(Date.now(), cid)
    this.pinnedPins.shared.remove(Date.now(), cid)
  }
}

const peerBaseContainer = new PeerBaseContainer()
peerBaseContainer.on('state changed pending', value => {
  console.log('Jim2 state changed pending', value)
  const { logux } = wrapper
  if (!logux) return
  logux.log.add(
    {
      type: 'updateSet',
      pendingPins: [...value.values()],
    },
    {
      reasons: ['update'],
      channels: ['peerBase'],
      sync: true
    }
  )
})

peerBaseContainer.on('state changed pinned', value => {
  console.log('Jim2 state changed pinned', value)
  const { logux } = wrapper
  if (!logux) return
  logux.log.add(
    {
      type: 'updateSet',
      pinnedPins: [...value.values()],
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

wrapper.on('requestPending', cid => {
  peerBaseContainer.pinPending(cid)
})

wrapper.on('requestPin', cid => {
  peerBaseContainer.pin(cid)
})

wrapper.on('requestRemove', cid => {
  peerBaseContainer.remove(cid)
})


const events = []

function rerender () {
  const { logux } = wrapper
  const pendingPinsEl = pendingPins ?
    (
      html`<ul>
        ${pendingPins.map(cid => html`
          <li>
            ${cid}
            [<a class="remove" @click=${pin} href="#">pin</a>]
            [<a class="remove" @click=${remove} href="#">x</a>]
          </li>
        `)}
      </ul>`
    ) :
    html`<div>Loading...</div>`
  const pinnedPinsEl = pinnedPins ?
    (
      html`<ul>
        ${pinnedPins.map(cid => html`
          <li>
            ${cid}
            [<a class="remove" @click=${remove} href="#">x</a>]
          </li>
        `)}
      </ul>`
    ) :
    html`<div>Loading...</div>`
  const page = html`
    <h1>Logux + PeerBase Test</h1>
    <div>
      Origin:
      <a href="${location.origin}" target="_blank">${location.origin}</a>
    </div>
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
    <h3>Pending Pin Requests</h3>
    ${pendingPinsEl}
    <h3>Pinned CIDs</h3>
    ${pinnedPinsEl}
    <h3>Log</h3>
    ${events.map(event => html`<div>${
      event.id[1] + ' ' + event.added + ' ' + event.time + ': ' +
      (event.click ? '[click]' : '') +
      (
        event.pendingPins ?
        'Pending: ' + event.pendingPins.toJS().join(' ') :
        ''
      ) + 
      (
        event.pinnedPins ?
        'Pinned:' + event.pinnedPins.toJS().join(' ') :
        ''
      )
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

  function remove (e) {
    const cid = e.target.parentElement.firstChild.nextSibling.data
    console.log('Remove', cid)
    if (!logux) return
    logux.log.add(
      {
        type: 'requestRemove',
        cid
      },
      {
        reasons: ['update'],
        channels: ['peerBase'],
        sync: true
      }
    )
    e.preventDefault()
  }

  function pin (e) {
    const cid = e.target.parentElement.firstChild.nextSibling.data
    console.log('Pin', cid)
    if (!logux) return
    logux.log.add(
      {
        type: 'requestPin',
        cid
      },
      {
        reasons: ['update'],
        channels: ['peerBase'],
        sync: true
      }
    )
    e.preventDefault()
  }
}

rerender()
setInterval(rerender, 1000)


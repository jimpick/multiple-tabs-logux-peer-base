import classes from './index.css'
import { html, render } from 'lit-html'
import CrossTabClient from 'logux-client/cross-tab-client'

const fakeServer = {
  on: () => {},
  connect: () => {}  
}

var logux = new CrossTabClient({
  credentials: '',
  subprotocol: '1.0.0',
  server: fakeServer,
  userId: 1
})
logux.start()

const events = []

function r () {
  const page = html`
    <h1>Logux Test</>
    <p>${new Date().toLocaleString()}</p>
    <p>ID: ${logux.id}</p>
    <p>Role: ${logux.role}</p>
    <div>
      <button @click=${click}>Log me!</button>
    </div>
    <h3>Log</h3>
    ${events.map(event => html`<div>${
      event.id[1] + ' ' + event.added + ' ' + event.time
    }</div>`)}
  `
  render(page, document.body)

  function click () {
    logux.log.add({ type: 'click' }, {
      reasons: ['click'],
      channels: ['clicks'],
      sync: true
    })
  }
}

r()
setInterval(r, 1000)

logux.log.add({ type: 'logux/subscribe', channel: 'clicks' }, { sync: true })

logux.on('add', function (action, meta) {
  if (action.type === 'click') {
    events.push(meta)
    r()
  }
})

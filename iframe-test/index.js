const channel = new MessageChannel()
const iframe = document.querySelector('iframe')
const button = document.querySelector('button')
const cidInput = document.querySelector('#cid')
const output = document.querySelector('.output')
let lastCid
iframe.addEventListener('load', () => {
  channel.port1.onmessage = e => {
    console.log('Jim from iframe', e.data)
    if (e.data.type === 'requestPendingReceived') {
      lastCid = e.data.cid
      output.innerHTML = 'Pinned: ' + lastCid + ' (pending)'
      cidInput.value = ''
    }
    if (e.data.type === 'pinned' && e.data.cid === lastCid) {
      output.innerHTML = 'Pinned: ' + lastCid + ' ✓'
      cidInput.value = ''
    }
  }
  iframe.contentWindow.postMessage({ type: 'setup' }, '*', [channel.port2])
  button.addEventListener('click', submit)
  cidInput.addEventListener('keydown', e => {
    if (e.code === 'Enter') {
      e.preventDefault()
      submit()
    }
  })

  function submit () {
    console.log('Pin CID:', cid.value)
    const message = {
      type: 'requestPending',
      cid: cidInput.value
    }
    iframe.contentWindow.postMessage(message, '*')
  }
})

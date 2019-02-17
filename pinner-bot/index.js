const util = require('util')
const execFile = util.promisify(require('child_process').execFile)
const PeerBase = require('peer-base')

async function run () {
  const app = PeerBase('simple-pinner-demo-1', {
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
  await app.start()

  const pendingCollab = await app.collaborate('pendingPins', 'rwlwwset')
  const pinnedCollab = await pendingCollab.sub('pinnedPins', 'rwlwwset')

  setTimeout(check, 1000)

  async function check () {
    const pending = new Set([...pendingCollab.shared.value()])
    const pinned = new Set([...pinnedCollab.shared.value()])
    // console.log('Pending:')
    for (const cid of pending) {
      if (!pinned.has(cid)) {
        console.log(`Pinning ${cid}`)
        // This could also use the http API
        await execFile(
          'ipfs-cluster-ctl',
          [
            '--host',
            '/ip4/172.17.0.3/tcp/9094',
            'pin',
            'add',
            '--name',
            'Pinned via PeerBase iframe',
            cid
          ]
        )
        pinnedCollab.shared.add(Date.now(), cid)
        pendingCollab.shared.remove(Date.now(), cid)
        console.log('Pinned.')
      }
    }
    setTimeout(check, 1000)
  }

}

run()

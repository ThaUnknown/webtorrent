import net from 'node:net'
import test from 'tape'
import WebTorrent from '../../index.js'

/** A TCP server that accepts connections and counts them, like a remote peer that never answers the handshake. */
function listen () {
  return new Promise(resolve => {
    const sockets = []
    const server = net.createServer(socket => {
      socket.on('error', () => {})
      sockets.push(socket)
    })
    server.listen(0, '127.0.0.1', () => {
      resolve({
        addr: `127.0.0.1:${server.address().port}`,
        sockets,
        close () {
          for (const socket of sockets) socket.destroy()
          server.close()
        }
      })
    })
  })
}

/** Gives a torrent with 1 connection slot. Peer A uses the slot and peer B waits in the queue. */
async function setup (t) {
  const peerA = await listen()
  const peerB = await listen()

  const client = new WebTorrent({ dht: false, tracker: false, lsd: false, utp: false, natUpnp: false, natPmp: false, maxConns: 1 })
  client.on('error', err => t.fail(err))
  const torrent = client.add('magnet:?xt=urn:btih:0000000000000000000000000000000000000001', { store: false })
  if (!torrent.infoHash) await new Promise(resolve => torrent.once('infoHash', resolve))

  torrent.addPeer(peerA.addr)
  torrent.addPeer(peerB.addr)
  t.deepEqual(torrent._queue.map(peer => peer.addr), [peerB.addr], 'peer B waits in the queue')

  async function destroy () {
    await new Promise(resolve => client.destroy(resolve))
    peerA.close()
    peerB.close()
  }

  return { torrent, peerA, peerB, destroy }
}

test('a peer that is removed while it waits in the queue is not dialled', async t => {
  t.timeoutAfter(5000)
  const { torrent, peerA, peerB, destroy } = await setup(t)

  torrent.removePeer(peerB.addr)
  t.deepEqual(torrent._queue, [], 'removePeer removes peer B from the queue')

  // Removing peer A frees the slot and drains the queue
  await new Promise(resolve => torrent._peers.get(peerA.addr).once('connect', resolve))
  torrent.removePeer(peerA.addr)
  await new Promise(resolve => setTimeout(resolve, 300))

  t.equal(peerB.sockets.length, 0, 'peer B got no connection')
  t.equal(torrent._numPending, 0, 'no connection is pending')

  await destroy()
})

// A connect timeout also destroys a peer while its connection is pending
test('a peer that is removed while its connection is pending frees its slot for the queue', async t => {
  t.timeoutAfter(5000)
  const { torrent, peerA, peerB, destroy } = await setup(t)

  // The connection to peer A is pending until the next turn of the event loop
  t.equal(torrent._numPending, 1, 'the connection to peer A is pending')
  torrent.removePeer(peerA.addr)
  // The reconnect of peer A starts after 1 second, so the queue must drain before then
  await new Promise(resolve => setTimeout(resolve, 300))

  t.equal(peerB.sockets.length, 1, 'peer B got a connection')

  await destroy()
})

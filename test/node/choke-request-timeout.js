import net from 'node:net'
import Wire from 'bittorrent-protocol'
import createTorrent from 'create-torrent'
import MemoryChunkStore from 'memory-chunk-store'
import { pipeline } from 'streamx'
import test from 'tape'
import WebTorrent from '../../index.js'

const PIECE_LENGTH = 64 * 1024
const CONTENT = new Uint8Array(8 * PIECE_LENGTH).map((_, i) => (i * 7) % 256)
const SERVED_BEFORE_CHOKE = 4
const REQUEST_TIMEOUT = 1000

function createTorrentFile () {
  return new Promise((resolve, reject) => {
    createTorrent(Buffer.from(CONTENT), { name: 'content.bin', pieceLength: PIECE_LENGTH, announceList: [] }, (err, torrent) => {
      if (err) reject(err)
      else resolve(torrent)
    })
  })
}

/**
 * A seeder with the fast extension. On its first connection, after it answers SERVED_BEFORE_CHOKE requests, it chokes.
 * BEP6 says that it must then reject all open requests, but it rejects only 1 and drops the others. Then it unchokes.
 * After that, it answers all requests.
 */
function listen () {
  return new Promise(resolve => {
    const sockets = []
    const held = []
    let connections = 0

    const server = net.createServer(socket => {
      socket.on('error', () => {})
      sockets.push(socket)
      const misbehave = connections++ === 0
      let served = 0
      let dropped = false

      const wire = new Wire()
      pipeline(socket, wire, socket)

      function dropHeldRequests () {
        // Forget the open requests, so that choke() does not reject them
        wire.peerRequests.length = 0
        wire.choke()
        const [rejected] = held
        wire.reject(rejected.index, rejected.offset, rejected.length)
        dropped = true
        setTimeout(() => wire.unchoke(), 100)
      }

      wire.on('handshake', infoHash => {
        wire.handshake(infoHash, 'aa'.repeat(20), { fast: true })
        wire.haveAll()
      })
      wire.on('interested', () => wire.unchoke())
      wire.on('request', (index, offset, length, callback) => {
        if (misbehave && !dropped && served >= SERVED_BEFORE_CHOKE) {
          held.push({ index, offset, length })
          if (held.length === 1) setTimeout(dropHeldRequests, 100)
          return
        }
        served++
        const start = index * PIECE_LENGTH + offset
        callback(null, CONTENT.slice(start, start + length))
      })
    })

    server.listen(0, '127.0.0.1', () => {
      resolve({
        addr: `127.0.0.1:${server.address().port}`,
        held,
        connections: () => connections,
        close () {
          for (const socket of sockets) socket.destroy()
          server.close()
        }
      })
    })
  })
}

test('requests that a choking peer never answers time out', async t => {
  t.timeoutAfter(10000)
  const seeder = await listen()

  // The seeder does not support protocol encryption
  const client = new WebTorrent({ dht: false, tracker: false, lsd: false, utp: false, natUpnp: false, natPmp: false, utPex: false, secure: 0 })
  client.on('error', err => t.fail(err))
  const torrent = client.add(await createTorrentFile(), { store: MemoryChunkStore })
  // Use a short request timeout, so that the test does not wait for PIECE_TIMEOUT
  torrent.on('wire', wire => wire.setTimeout(REQUEST_TIMEOUT, true))
  await new Promise(resolve => torrent.once('ready', resolve))
  torrent.addPeer(seeder.addr)

  const done = new Promise(resolve => torrent.once('done', () => resolve(true)))
  const timeout = new Promise(resolve => setTimeout(() => resolve(false), 6000).unref())
  try {
    t.ok(await Promise.race([done, timeout]), 'the download completes')
    t.ok(seeder.held.length >= 3, `the seeder dropped more than 1 request (held ${seeder.held.length}, rejected 1)`)
    if (torrent.done) t.deepEqual(new Uint8Array(await torrent.files[0].arrayBuffer()), CONTENT, 'downloaded correct content')
  } finally {
    await new Promise(resolve => client.destroy(resolve))
    seeder.close()
  }
})

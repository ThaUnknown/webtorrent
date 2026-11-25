import createTorrent from 'create-torrent'
import MemoryChunkStore from 'memory-chunk-store'
import test from 'tape'
import WebTorrent from '../../index.js'

const BLOCK_LENGTH = 16 * 1024
// 1 piece of 2 blocks
const CONTENT = new Uint8Array(2 * BLOCK_LENGTH).map((_, i) => i % 256)

/** A wire that keeps each request until the test answers it. */
function createWire (speed) {
  return {
    type: 'tcpOutgoing',
    requests: [],
    downloadSpeed: () => speed,
    request (piece, offset, length, callback) {
      this.requests.push({ piece, offset, length, callback })
    },
    async fail (request) {
      this.requests.splice(this.requests.indexOf(request), 1)
      await request.callback(new Error('the request failed'))
    }
  }
}

function createTorrentFile () {
  return new Promise((resolve, reject) => {
    createTorrent(Buffer.from(CONTENT), { name: 'content.bin', pieceLength: CONTENT.length, announceList: [] }, (err, torrent) => {
      if (err) reject(err)
      else resolve(torrent)
    })
  })
}

test('a failed request that a hotswap freed does not free its blocks again when its wire reuses the reservation slot', async t => {
  const client = new WebTorrent({ dht: false, tracker: false, lsd: false, natUpnp: false, natPmp: false, utPex: false })
  client.on('error', err => t.fail(err))

  const torrent = client.add(await createTorrentFile(), { store: MemoryChunkStore })
  await new Promise(resolve => torrent.once('ready', resolve))
  // stop the torrent from making its own requests
  torrent._update = () => {}

  const slowWire = createWire(1)
  const fastWire = createWire(1024 * 1024)

  t.ok(torrent._request(slowWire, 0, false), 'the slow wire reserves block 1')
  t.ok(torrent._request(slowWire, 0, false), 'the slow wire reserves block 2')
  const [, oldRequest] = slowWire.requests

  t.ok(torrent._request(fastWire, 0, true), 'the fast wire hotswaps the slow wire and reserves 1 block')
  t.ok(torrent._request(slowWire, 0, false), 'the slow wire reserves the other block again')
  t.equal(torrent._reservations[0][1]?.wire, slowWire, 'the new request uses the slot of the old request')

  await slowWire.fail(oldRequest)

  t.equal(torrent.pieces[0].reserve(), -1, 'both blocks stay reserved, so no block is requested 2 times')

  await new Promise(resolve => client.destroy(resolve))
})

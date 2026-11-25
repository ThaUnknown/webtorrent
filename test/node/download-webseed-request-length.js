import BitField from 'bitfield'
import Wire from 'bittorrent-protocol'
import createTorrent from 'create-torrent'
import ltDontHave from 'lt_donthave'
import MemoryChunkStore from 'memory-chunk-store'
import test from 'tape'
import { hash } from 'uint8-util'
import WebTorrent from '../../index.js'

const PIECE_LENGTH = 256 * 1024
// 4 full pieces and 1 short piece
const CONTENT = new Uint8Array(4 * PIECE_LENGTH + 1000).map((_, i) => (i * 7) % 256)

/** A webseed connection that serves CONTENT, like a custom webseed that an application adds with addWebSeed. */
class ContentWebSeed extends Wire {
  constructor (id, torrent, { failFirstRequest = false, holdRequest } = {}) {
    super()
    this.connId = id
    this.requestLengths = []
    this.failNextRequest = failFirstRequest

    this.setKeepAlive(true)
    this.use(ltDontHave())

    this.once('handshake', async infoHash => {
      const peerId = await hash(id, 'hex')
      if (this.destroyed) return
      this.handshake(infoHash, peerId)
      const bitfield = new BitField(torrent.pieces.length)
      for (let i = 0; i < torrent.pieces.length; i++) bitfield.set(i, true)
      this.bitfield(bitfield)
    })
    this.once('interested', () => this.unchoke())

    this.on('request', (pieceIndex, offset, length, callback) => {
      this.requestLengths.push(length)
      if (holdRequest?.(this, pieceIndex, offset, length, callback)) return
      if (this.failNextRequest) {
        this.failNextRequest = false
        // A webseed reports a failure with donthave, like WebConn. Then it offers the piece again.
        this.lt_donthave.donthave(pieceIndex)
        setTimeout(() => this.have(pieceIndex), 50)
        return queueMicrotask(() => callback(new Error('the first request fails')))
      }
      const start = pieceIndex * torrent.pieceLength + offset
      queueMicrotask(() => callback(null, CONTENT.slice(start, start + length)))
    })
  }
}

function createTorrentFile () {
  return new Promise((resolve, reject) => {
    createTorrent(Buffer.from(CONTENT), { name: 'content.bin', pieceLength: PIECE_LENGTH, announceList: [] }, (err, torrent) => {
      if (err) reject(err)
      else resolve(torrent)
    })
  })
}

/** Downloads CONTENT from ContentWebSeeds and gives the request lengths that the webseeds received. */
async function download (t, { requestLength, failFirstRequest, holdRequest, webSeedCount = 1 } = {}) {
  const client = new WebTorrent({ dht: false, tracker: false, lsd: false, natUpnp: false, natPmp: false, utPex: false })
  client.on('error', err => t.fail(err))

  const torrent = client.add(await createTorrentFile(), { store: MemoryChunkStore })
  await new Promise(resolve => torrent.once('ready', resolve))

  const webSeeds = []
  for (let i = 0; i < webSeedCount; i++) {
    const webSeed = new ContentWebSeed(`content-web-seed-${i}`, torrent, { failFirstRequest, holdRequest })
    torrent.addWebSeed(webSeed)
    if (requestLength) torrent._peers.get(webSeed.connId).wire.webSeedRequestLength = requestLength
    webSeeds.push(webSeed)
  }

  const done = new Promise(resolve => torrent.once('done', resolve))
  const timeout = new Promise((resolve, reject) => setTimeout(() => reject(new Error('the download did not complete')), 4000).unref())
  try {
    await Promise.race([done, timeout])
    const downloaded = new Uint8Array(await torrent.files[0].arrayBuffer())
    return { requestLengths: webSeeds.flatMap(webSeed => webSeed.requestLengths), downloaded }
  } finally {
    await new Promise(resolve => client.destroy(resolve))
  }
}

test('webSeedRequestLength limits the size of each webseed request', async t => {
  t.timeoutAfter(5000)
  const requestLength = 64 * 1024

  const { requestLengths, downloaded } = await download(t, { requestLength })

  t.deepEqual(downloaded, CONTENT, 'downloaded correct content')
  t.ok(requestLengths.every(length => length <= requestLength), `no request is larger than ${requestLength} bytes (got ${[...new Set(requestLengths)]})`)
  t.ok(requestLengths.length >= Math.ceil(CONTENT.length / requestLength), 'each piece needs more than 1 request')
})

test('a webseed without webSeedRequestLength requests whole pieces', async t => {
  t.timeoutAfter(5000)

  const { requestLengths, downloaded } = await download(t)

  t.deepEqual(downloaded, CONTENT, 'downloaded correct content')
  t.deepEqual([...requestLengths].sort((a, b) => a - b), [1000, PIECE_LENGTH, PIECE_LENGTH, PIECE_LENGTH, PIECE_LENGTH], '1 request for each piece')
})

test('a failed webseed request with webSeedRequestLength frees its blocks for a new request', async t => {
  t.timeoutAfter(5000)
  const requestLength = 64 * 1024

  const { requestLengths, downloaded } = await download(t, { requestLength, failFirstRequest: true })

  t.deepEqual(downloaded, CONTENT, 'downloaded correct content after the failed request')
  t.ok(requestLengths.every(length => length <= requestLength), 'the new requests are also limited')
})

// An NZB webseed uses 1 connection for each NNTP connection. When an article of a piece fails, all connections give up the piece.
// Then the requests for the other ranges of the piece fail too, in an order that is not the order of their offsets.
test('failed requests for all ranges of 1 piece on several webseeds free all blocks of the piece', async t => {
  t.timeoutAfter(5000)
  const requestLength = 64 * 1024
  const failedPiece = 1
  const held = []
  let failed = false

  async function failHeldRequests () {
    // The last failure that the torrent gets is for a range after the start of the piece
    const webSeeds = [...new Set(held.sort((a, b) => a.offset - b.offset).map(request => request.webSeed))]
    for (const webSeed of webSeeds) {
      webSeed.lt_donthave.donthave(failedPiece)
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    for (const { callback } of held) callback(new Error('the article is missing'))
    // An NZB that the application adds later offers the piece again
    for (const webSeed of webSeeds) webSeed.have(failedPiece)
  }

  function holdRequest (webSeed, pieceIndex, offset, length, callback) {
    if (failed || pieceIndex !== failedPiece) return false
    held.push({ webSeed, offset, length, callback })
    if (held.reduce((sum, request) => sum + request.length, 0) >= PIECE_LENGTH) {
      failed = true
      failHeldRequests()
    }
    return true
  }

  const { downloaded } = await download(t, { requestLength, holdRequest, webSeedCount: 4 })

  t.ok(failed, 'all requests for the piece failed')
  t.ok(new Set(held.map(request => request.webSeed)).size > 1, 'the requests for the piece were on more than 1 webseed')
  t.deepEqual(downloaded, CONTENT, 'downloaded correct content after the piece was offered again')
})

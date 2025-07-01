import fs from 'fs'
import path from 'path'
import os from 'os'
import createTorrent from 'create-torrent'
import MemoryChunkStore from 'memory-chunk-store'
import test from 'tape'
import WebTorrent from '../../index.js'

// Create a simple test file and torrent for testing
const TEST_DATA = Buffer.from('WebTorrent protocol encryption test file')
const TEST_FILE_NAME = 'encryption-test.txt'
const TEST_FILE_PATH = path.join(os.tmpdir(), TEST_FILE_NAME)

// Write test file
fs.writeFileSync(TEST_FILE_PATH, TEST_DATA)

// Create torrent (promisified)
const createTorrentPromise = (filePath) => {
  return new Promise((resolve, reject) => {
    createTorrent(filePath, (err, torrent) => {
      if (err) return reject(err)
      resolve(torrent)
    })
  })
}

// test('Protocol Encryption: TCP outbound connection', async (t) => {
//   t.plan(6)
//   t.timeoutAfter(10000)

//   // Create a torrent from our test file
//   let torrentFile
//   try {
//     torrentFile = await createTorrentPromise(TEST_FILE_PATH)
//     t.pass('Created test torrent file')
//   } catch (err) {
//     t.fail(`Failed to create test torrent: ${err.message}`)
//     t.end()
//     return
//   }

//   // Create seeder with encryption enabled
//   const seeder = new WebTorrent({
//     tracker: false,
//     dht: false,
//     lsd: false,
//     secure: true,
//     natPmp: false,
//     natUpnp: false
//   })

//   seeder.on('error', (err) => t.fail(err))
//   seeder.on('warning', (err) => t.fail(err))

//   const torrent = seeder.add(torrentFile, { store: MemoryChunkStore })

//   torrent.on('ready', () => {
//     // torrent metadata has been fetched -- sanity check it
//     t.equal(torrent.name, TEST_FILE_NAME, 'Torrent has correct name')
//   })

//   // Wait for the torrent to be ready and loaded
//   await new Promise((resolve, reject) => {
//     torrent.on('ready', () => {
//       // Load the test file content
//       torrent.load(fs.createReadStream(TEST_FILE_PATH), (err) => {
//         if (err) return reject(err)
//         t.pass('Loaded test file into torrent')
//         resolve()
//       })
//     })
//   }).catch(err => {
//     t.fail(`Failed to load test file: ${err.message}`)
//     t.end()
//   })

//   // Create downloader with encryption enabled
//   const downloader = new WebTorrent({
//     tracker: false,
//     dht: false,
//     lsd: false,
//     secure: true,
//     natPmp: false,
//     natUpnp: false
//   })

//   downloader.on('error', err => { t.fail(err) })
//   downloader.on('warning', err => { t.fail(err) })

//   const downloadTorrent = downloader.add(torrentFile, { store: MemoryChunkStore }, () => {
//     // Add the seeder as a peer (outbound connection)
//     downloadTorrent.addPeer(`localhost:${seeder.torrentPort}`)
//   })

//   // Wait for the download to complete
//   await new Promise((resolve) => {
//     downloadTorrent.once('done', async () => {
//       for (const file of downloadTorrent.files) {
//         try {
//           const ab = await file.arrayBuffer()
//           t.deepEqual(new Uint8Array(ab), TEST_DATA, 'Downloaded correct content')
//         } catch (err) {
//           t.error(err)
//         }
//       }
//       resolve()
//     })
//   })

//   // Clean up
//   await Promise.all([
//     new Promise(resolve => seeder.destroy(err => {
//       t.error(err, 'Seeder destroyed')
//       resolve()
//     })),
//     new Promise(resolve => downloader.destroy(err => {
//       t.error(err, 'Downloader destroyed')
//       resolve()
//     }))
//   ])
// })

// test('Protocol Encryption: TCP inbound connection', async (t) => {
//   t.plan(6)
//   t.timeoutAfter(10000)

//   // Create a torrent from our test file
//   let torrentFile
//   try {
//     torrentFile = await createTorrentPromise(TEST_FILE_PATH)
//     t.pass('Created test torrent file')
//   } catch (err) {
//     t.fail(`Failed to create test torrent: ${err.message}`)
//     t.end()
//     return
//   }

//   // Create downloader with encryption enabled
//   const downloader = new WebTorrent({
//     tracker: false,
//     dht: false,
//     lsd: false,
//     secure: true,
//     natPmp: false,
//     natUpnp: false
//   })

//   downloader.on('error', err => { t.fail(err) })
//   downloader.on('warning', err => { t.fail(err) })

//   // Add torrent to downloader first
//   const downloadTorrent = downloader.add(torrentFile, { store: MemoryChunkStore })

//   // Wait for downloader to be ready
//   await new Promise(resolve => {
//     downloader.on('listening', () => {
//       t.pass('Downloader is listening')
//       resolve()
//     })
//   })

//   // Create seeder with encryption enabled
//   const seeder = new WebTorrent({
//     tracker: false,
//     dht: false,
//     lsd: false,
//     secure: true,
//     natPmp: false,
//     natUpnp: false
//   })

//   seeder.on('error', (err) => t.fail(err))
//   seeder.on('warning', (err) => t.fail(err))

//   const seedTorrent = seeder.add(torrentFile, { store: MemoryChunkStore })

//   // Wait for the seeder to be ready and load the content
//   await new Promise((resolve, reject) => {
//     seedTorrent.on('ready', () => {
//       // Load the test file content
//       seedTorrent.load(fs.createReadStream(TEST_FILE_PATH), (err) => {
//         if (err) return reject(err)
//         t.pass('Loaded test file into seeder')

//         // Connect to the downloader (inbound connection for downloader)
//         seedTorrent.addPeer(`localhost:${downloader.torrentPort}`)
//         resolve()
//       })
//     })
//   }).catch(err => {
//     t.fail(`Failed to load test file: ${err.message}`)
//     t.end()
//   })

//   // Wait for the download to complete
//   await new Promise((resolve) => {
//     downloadTorrent.once('done', async () => {
//       for (const file of downloadTorrent.files) {
//         try {
//           const ab = await file.arrayBuffer()
//           t.deepEqual(new Uint8Array(ab), TEST_DATA, 'Downloaded correct content')
//         } catch (err) {
//           t.error(err)
//         }
//       }
//       resolve()
//     })
//   })

//   // Clean up
//   await Promise.all([
//     new Promise(resolve => seeder.destroy(err => {
//       t.error(err, 'Seeder destroyed')
//       resolve()
//     })),
//     new Promise(resolve => downloader.destroy(err => {
//       t.error(err, 'Downloader destroyed')
//       resolve()
//     }))
//   ])
// })

test('Protocol Encryption: UTP connection', async (t) => {
  // Skip test if UTP is not supported
  if (!WebTorrent.UTP_SUPPORT) {
    t.pass('UTP not supported, skipping test')
    t.end()
    return
  }

  t.plan(6)
  t.timeoutAfter(10000)

  // Create a torrent from our test file
  let torrentFile
  try {
    torrentFile = await createTorrentPromise(TEST_FILE_PATH)
    t.pass('Created test torrent file')
  } catch (err) {
    t.fail(`Failed to create test torrent: ${err.message}`)
    t.end()
    return
  }

  // Create seeder with encryption enabled and UTP enabled
  const seeder = new WebTorrent({
    tracker: false,
    dht: false,
    lsd: false,
    secure: true,
    utp: true,
    natPmp: false,
    natUpnp: false
  })

  seeder.on('error', (err) => t.fail(err))
  seeder.on('warning', (err) => t.fail(err))

  const torrent = seeder.add(torrentFile, { store: MemoryChunkStore })

  // Wait for the torrent to be ready and loaded
  await new Promise((resolve, reject) => {
    torrent.on('ready', () => {
      // Load the test file content
      torrent.load(fs.createReadStream(TEST_FILE_PATH), (err) => {
        if (err) return reject(err)
        t.pass('Loaded test file into torrent')
        resolve()
      })
    })
  }).catch(err => {
    t.fail(`Failed to load test file: ${err.message}`)
    t.end()
  })

  // Create downloader with encryption enabled and UTP enabled
  const downloader = new WebTorrent({
    tracker: false,
    dht: false,
    lsd: false,
    secure: true,
    utp: true,
    natPmp: false,
    natUpnp: false
  })

  downloader.on('error', err => { t.fail(err) })
  downloader.on('warning', err => { t.fail(err) })

  const downloadTorrent = downloader.add(torrentFile, { store: MemoryChunkStore }, () => {
    // Add the seeder as a peer
    downloadTorrent.addPeer(`localhost:${seeder.torrentPort}`)
  })

  // Wait for the download to complete
  await new Promise((resolve) => {
    downloadTorrent.once('done', async () => {
      for (const file of downloadTorrent.files) {
        try {
          const ab = await file.arrayBuffer()
          t.deepEqual(new Uint8Array(ab), TEST_DATA, 'Downloaded correct content')
        } catch (err) {
          t.error(err)
        }
      }
      resolve()
    })
  })

  // Clean up
  await Promise.all([
    new Promise(resolve => seeder.destroy(err => {
      t.error(err, 'Seeder destroyed')
      resolve()
    })),
    new Promise(resolve => downloader.destroy(err => {
      t.error(err, 'Downloader destroyed')
      resolve()
    }))
  ])
})

// test('Protocol Encryption: TCP and UTP mixed', async (t) => {
//   // Skip test if UTP is not supported
//   if (!WebTorrent.UTP_SUPPORT) {
//     t.pass('UTP not supported, skipping test')
//     t.end()
//     return
//   }

//   t.plan(6)
//   t.timeoutAfter(10000)

//   // Create a torrent from our test file
//   let torrentFile
//   try {
//     torrentFile = await createTorrentPromise(TEST_FILE_PATH)
//     t.pass('Created test torrent file')
//   } catch (err) {
//     t.fail(`Failed to create test torrent: ${err.message}`)
//     t.end()
//     return
//   }

//   // Create seeder with encryption enabled and UTP enabled
//   const seeder = new WebTorrent({
//     tracker: false,
//     dht: false,
//     lsd: false,
//     secure: true,
//     utp: true,
//     natPmp: false,
//     natUpnp: false
//   })

//   seeder.on('error', (err) => t.fail(err))
//   seeder.on('warning', (err) => t.fail(err))

//   const torrent = seeder.add(torrentFile, { store: MemoryChunkStore })

//   // Wait for the torrent to be ready and loaded
//   await new Promise((resolve, reject) => {
//     torrent.on('ready', () => {
//       // Load the test file content
//       torrent.load(fs.createReadStream(TEST_FILE_PATH), (err) => {
//         if (err) return reject(err)
//         t.pass('Loaded test file into torrent')
//         resolve()
//       })
//     })
//   }).catch(err => {
//     t.fail(`Failed to load test file: ${err.message}`)
//     t.end()
//   })

//   // Create downloader with encryption enabled but UTP disabled (forcing TCP)
//   const downloader = new WebTorrent({
//     tracker: false,
//     dht: false,
//     lsd: false,
//     secure: true,
//     utp: false,
//     natPmp: false,
//     natUpnp: false
//   })

//   downloader.on('error', err => { t.fail(err) })
//   downloader.on('warning', err => { t.fail(err) })

//   const downloadTorrent = downloader.add(torrentFile, { store: MemoryChunkStore }, () => {
//     // Add the seeder as a peer
//     downloadTorrent.addPeer(`localhost:${seeder.torrentPort}`)
//   })

//   // Wait for the download to complete
//   await new Promise((resolve) => {
//     downloadTorrent.once('done', async () => {
//       for (const file of downloadTorrent.files) {
//         try {
//           const ab = await file.arrayBuffer()
//           t.deepEqual(new Uint8Array(ab), TEST_DATA, 'Downloaded correct content')
//         } catch (err) {
//           t.error(err)
//         }
//       }
//       resolve()
//     })
//   })

//   // Clean up
//   await Promise.all([
//     new Promise(resolve => seeder.destroy(err => {
//       t.error(err, 'Seeder destroyed')
//       resolve()
//     })),
//     new Promise(resolve => downloader.destroy(err => {
//       t.error(err, 'Downloader destroyed')
//       resolve()
//     }))
//   ])
// })

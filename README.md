<p align="center">
  <img src=".github/readme/hero.webp" alt="Five Dumpus share cards for a made-up account: 177,088 messages sent, top DMs, a 7-year recap, top servers and a 10 PM peak hour" width="100%">
</p>

<h1 align="center">Dumpus</h1>

<p align="center">
  <b>Stats for Discord.</b> Dumpus reads the data package Discord gives you, shows who you talk to, where you hang out and when you're online, and turns it into cards to share.
</p>

<p align="center">
  <a href="https://apps.apple.com/us/app/dumpus-stats-for-discord/id6450952260"><img src="assets/appstore.svg" alt="Download on the App Store" height="54"></a>
  <a href="https://play.google.com/store/apps/details?id=app.dumpus.app"><img src="assets/playstore.svg" alt="Get it on Google Play" height="54"></a>
  <a href="https://web.dumpus.app"><img src=".github/readme/web-app.svg" alt="Open the web app" height="54"></a>
</p>

<p align="center">
  Desktop builds for <a href="https://github.com/Androz2091/dumpus-app/releases/latest">Windows and macOS</a> · <a href="https://androz2091.fr/discord">Our Discord server</a>
</p>

## What you get

<table>
  <tr>
    <td align="center" width="25%"><img src=".github/readme/overview.webp" alt="The overview of a made-up account: messages sent, most active DMs and servers"></td>
    <td align="center" width="25%"><img src=".github/readme/top.webp" alt="The top DMs of a made-up account"></td>
    <td align="center" width="25%"><img src=".github/readme/stats.webp" alt="Charts of messages sent and minutes on Discord over seven years"></td>
    <td align="center" width="25%"><img src=".github/readme/details.webp" alt="A friend's page: messages, top chat hour, sentiment and activity over time"></td>
  </tr>
  <tr>
    <td align="center">Your numbers at a glance</td>
    <td align="center">Top DMs, servers and channels</td>
    <td align="center">Your activity over time</td>
    <td align="center">A page for each of them</td>
  </tr>
</table>

- Look at the last 4 weeks, 6 months, year, or your whole history.
- Share 8 story cards and a square summary, drawn on your device.
- Keep several packages and switch between them.

The screenshots and cards show a made-up account.

## Your data

- You paste the link from Discord's email. Our server downloads the package, turns it into a database with [`dumpus-processor`](processor), and deletes the zip.
- It stores that database encrypted with a key from your link, and deletes the link once processing starts, so what it keeps can't be read without your link. The app decrypts it on your device.
- **Delete current package** in the settings deletes it from your device and from our server. Encrypted copies are deleted after 90 days anyway.
- It's all open source, and you can [run your own server](api/README.md#self-hosting).

## Processing in Go

Packages are processed in Go: **3.7× faster** and **5× less memory** than with Python.

|                                  | Python | Go     |
| -------------------------------- | ------ | ------ |
| Typical package (median)         | 16.8 s | 4.4 s  |
| Large packages (90th percentile) | 48.4 s | 14.9 s |
| Peak memory (median)             | 277 MB | 51 MB  |
| Start-up                         | 0.27 s | 1.1 ms |

Tested on real packages, 2 CPUs, median of 3 runs per package.

## In this repo

| Folder                                                                         | What it is                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [`src/`](src), [`android/`](android), [`ios/`](ios), [`src-tauri/`](src-tauri) | The app, in Next.js, with Capacitor for Android and iOS and Tauri on desktop    |
| [`api/`](api)                                                                  | The API that queues packages and hands out their encrypted databases, in Python |
| [`processor/`](processor)                                                      | `dumpus-processor`, which turns a package into the app's database, in Go        |
| [`landing/`](landing)                                                          | [dumpus.app](https://dumpus.app), the website                                   |

## Contributing

- [CONTRIBUTING.md](CONTRIBUTING.md): how to send a change
- [DEVELOPERS.md](DEVELOPERS.md): run and build the app
- [TRANSLATING.md](TRANSLATING.md): translate it on Crowdin

Dumpus is the next version of the [Discord Data Package Explorer](https://ddpe.androz2091.fr), and is licensed under [GPL-3.0](LICENSE).

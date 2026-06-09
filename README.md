### spotify backup export ![status](https://img.shields.io/badge/status%20as%20of%2009/06/2026-working-lightgreen)

Backs up saved tracks and playlists to a JSON file and can restore them. Uses non-deprecated APIs. Bulks add/request data so to not trigger 429 rate limit errors. Persist session upon reload.

### Setup

```bash
cp public/config.sample.js public/config.js
npm i
```

Sign up and create an app here https://developer.spotify.com/. Put `http://127.0.0.1:8080/callback` as redirect URI. Save the Client ID to the `/public/config.js` file.

Add the users' emails that will use the app in the `User Management` tab of the Spotify app.

### Use

```bash
npm start
```

Browse http://127.0.0.1:36177/

### Issues

The non-deprecated Spotify APIs are very poorly done and don't support ordering, thus saved tracks will be scrambled.

Need Spotify premium and cannot support more than 5 users: https://developer.spotify.com/documentation/web-api/concepts/quota-modes

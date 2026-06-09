const crypto = require('crypto');
const path = require('path');
const express = require('express');
const { stringify } = require("querystring");
const config = require("./public/config");

const app = express();

function generateRandomString(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function generateCodeChallenge(codeVerifier) {
    const digest = crypto.createHash('sha256').update(codeVerifier).digest();
    return Buffer.from(digest).toString('base64url').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store code verifiers by state
const authStates = {};

app.get('/login', (req, res) => {
    const codeVerifier = generateRandomString(128);
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateRandomString(16);

    authStates[state] = codeVerifier;

    res.redirect('https://accounts.spotify.com/authorize?' + stringify({
        response_type: 'code',
        client_id: config.client_id,
        scope: 'user-read-private user-read-email playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-library-read user-library-modify user-follow-read user-follow-modify',
        redirect_uri: config.callback_uri,
        state: state,
        code_challenge_method: "S256",
        code_challenge: codeChallenge,
    }));
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null || !authStates[state]) {
        res.redirect('/#' + stringify({error: 'state_mismatch'}));
    } else {
        const codeVerifier = authStates[state];
        delete authStates[state];

        try {
            const payload = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: config.client_id,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: config.callback_uri,
                    code_verifier: codeVerifier,
                }),
            };

            const response = await fetch("https://accounts.spotify.com/api/token", payload);
            const responseBody = await response.json();

            if (responseBody.error) {
                return res.send(`Error during getAccessToken: ${responseBody.error}`);
            }

            const token = responseBody.access_token;
            res.send(`Login successful! Returning to app...` + `<script type='text/javascript'>window.onload = () => { window.opener.postMessage({token:"${token}"}, "${config.uri}"); window.close(); }</script>`);
        } catch (e) {
            res.send("Failed to get token " + e.message);
        }
    }
});

const port = process.env.PORT || config.port;
app.listen(port, '0.0.0.0', () => {
    console.log(`spotify backup restore is running on port ${port}`);
});

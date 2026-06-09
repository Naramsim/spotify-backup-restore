config = {
    "port": 36177,
    "uri": "http://127.0.0.1:36177",
    "login_url": "http://127.0.0.1:36177/login",
    "callback_uri": "http://127.0.0.1:36177/callback",
    "client_id": "your_id",
    "slowdown_import": 200,
    "slowdown_export": 100
}

if(typeof module !== 'undefined'){
    module.exports = config;
}
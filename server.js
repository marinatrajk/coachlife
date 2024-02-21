const WebSocket = require('ws');
const child_process = require('child_process');
const url = require('url');
const port = process.env.PORT || 8080

const wss = new WebSocket.Server({ port });

wss.on('connection', function connection(ws, req) {
    console.log('websocket connected');

    const queryString = url.parse(req.url).search;
    const params = new URLSearchParams(queryString);
    const key = params.get('key');

    const rtmpUrl = `rtmps://global-live.mux.com/app/${key}`;
    console.log(rtmpUrl);

    const ffmpeg = child_process.spawn('./node_modules/ffmpeg-static/ffmpeg.exe', [
        '-i', '-',

        // video codec config: low latency, adaptive bitrate
        // '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',

        // copying video codec since we're receiving a format supported by mux
        '-vcodec', 'copy',

        // audio codec config: sampling frequency (11025, 22050, 44100), bitrate 64 kbits
        '-c:a', 'aac', '-strict', '-2', '-ar', '44100', '-b:a', '64k',

        //force to overwrite
        '-y',

        // used for audio sync
        '-use_wallclock_as_timestamps', '1',
        '-async', '1',

        //'-filter_complex', 'aresample=44100', // resample audio to 44100Hz, needed if input is not 44100
        //'-strict', 'experimental',
        '-bufsize', '1000',
        '-f', 'flv',

        rtmpUrl
    ]);

    // report any errors with ffmpeg
    ffmpeg.on('close', (code, signal) => {
        console.log('ffmpeg child process closed, code ' + code + ', signal ' + signal);
    });

    // handle STDIN pipe errors by logging to the console
    // errors most commonly occur when ffmpeg closes and there's still data to write
    ffmpeg.stdin.on('error', (e) => {
        console.log('ffmpeg STDIN error: ', e);
    });

    // ffmpeg outputs all of its messages to STDERR, logging them to the console.
    ffmpeg.stderr.on('data', (data) => {
        ws.send('ffmpeg got some data');
        console.log('ffmpeg STDERR output: ', data.toString());
    });

    ws.on('message', msg => {
        if (Buffer.isBuffer(msg)) {
            console.log('received some video data');
            ffmpeg.stdin.write(msg);
        } else {
            console.log(msg);
        }
    });

    ws.on('close', e => {
        console.log('websocket got closed');
        ffmpeg.kill('SIGINT');
    });

});
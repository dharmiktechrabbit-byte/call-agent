router.post("/play-reply", (req, res) => {
    const fileName = req.query.file;

    res.type("text/xml");
    res.send(`
        <Response>
            <Play>${process.env.BASE_URL}/audio/${fileName}</Play>
            <Connect>
                <Stream url="${process.env.WS_URL}/media-stream" />
            </Connect>
        </Response>
    `);
});
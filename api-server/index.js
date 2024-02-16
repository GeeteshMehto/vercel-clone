const express = require('express');
const { generateSlug } = require('random-word-slugs');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');

const {Server} = require('socket.io')
const Redis =  require('ioredis')

const app = express();
const PORT = 9000;

const subscriber = new Redis('redis-connect-link')

const io = new Server({cors: '*'})


io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
    })
})

io.listen(9001, ()=> console.log("Socket sever 9001"))



app.use(express.json());

const ecsClient = new ECSClient({
    region: 'us-west-1',
    credentials: {
        accessKeyId:'your-access-id',
        secretAccessKey:'your-secret-key'
    }
});

const config = {
    CLUSTER: 'aws-cluster-arn',
    TASK: 'aws-task-arn'
};

app.post('/project', async (req, res) => {
    try {
        const gitURL = req.body.gitURL; // Assuming you're expecting gitURL in the request body
        const slug = req.body.slug
        const projectSlug = slug ? slug : generateSlug();

        const command = new RunTaskCommand({
            cluster: config.CLUSTER,
            taskDefinition: config.TASK,
            launchType: 'FARGATE',
            count: 1,
            networkConfiguration: {
                awsvpcConfiguration: {
                    assignPublicIp: "ENABLED",
                    subnets: ['subnet', 'subnet'],
                    securityGroups: ['security-group']
                }
            },
            overrides: {
                containerOverrides: [
                    {
                        name: 'build-image',
                        environment: [
                            { name: 'GIT_REPOSITORY__URL', value: gitURL },
                            { name: 'PROJECT_ID', value: projectSlug }
                        ]
                    }
                ]
            }
        });

        await ecsClient.send(command);

        return res.json({ status: 'queued', data: { projectSlug, url: `http://${projectSlug}.localhost:8000` } });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});


async function initRedisSubscribe() {
    console.log('Subscribed to logs....')
    subscriber.psubscribe('logs:*')
    subscriber.on('pmessage', (pattern, channel, message) => {
        io.to(channel).emit('message', message)
    })
}


initRedisSubscribe()

app.listen(PORT, () => console.log(`API server running on port ${PORT}`));

const {exec} = require('child_process')
const path =require('path')
const fs = require('fs')
const {S3Client, PutObjectAclCommand, PutObjectCommand} = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const Redis = require('ioredis')



const publisher = new Redis('redis-link')





const s3Client = new S3Client({

    region:'us-west-1',

    credentials:{
        accessKeyId:'your-access-id',
        secretAccessKey:'your-access-key'
    }
})

const PROJECT_ID = process.env.PROJECT_ID

function publishLog(log) {
    publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({log}))

}

async function init() {
    console.log("Executing script.js");
    publishLog("Build started....")
    const outDirPath = path.join(__dirname, 'output');

    const p = exec(`cd ${outDirPath} && npm install && npm run build`);

    p.stdout.on('data', function(data) {
        console.log(data.toString());
        publishLog(data.toString())
    });

    p.stderr.on('data', function(data) {
        console.error('Error:', data.toString());
        publishLog(`error:${data.toString()}`)
    });

    p.on('close', async function() {
        console.log("Build complete");
        publishLog("Build complete")
        const distFolderPath = path.join(outDirPath, 'dist');
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true });

        publishLog("Starting to upload")
        
        for (const fileName of distFolderContents) {
            const filePath = path.join(distFolderPath, fileName);
            if (fs.lstatSync(filePath).isDirectory()) {
                continue; // Skip directories
            } else {
                console.log('Uploading', fileName);
                publishLog(`Uploading ${fileName}`)
                const command = new PutObjectCommand({
                    Bucket: 'vercel-clone-output-dir',
                    Key: `__output/${PROJECT_ID}/${fileName}`,
                    Body: fs.createReadStream(filePath),
                    ContentType: mime.lookup(filePath)
                });

                try {
                    await uploadFile(command, fileName);
                    publishLog(`Uploaded ${fileName}`)
                    console.log('Uploaded', fileName);
                } catch (err) {
                    console.error('Error uploading', fileName, err);
                }
            }
        }
        publishLog("Done")

        console.log("Done....");
    });
}

async function uploadFile(command, fileName) {
    return new Promise((resolve, reject) => {
        s3Client.send(command)
            .then(() => {
                resolve();
            })
            .catch(err => {
                reject(err);
            });
    });
}


init()
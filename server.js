const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

// 指向 py 文件夹的 pro 目录
const directoryPath = path.resolve('/home/yangqian/Dev/txtReader/pro');

app.use(express.static(__dirname));

// 列出 pro 目录下的所有文件，按修改时间排序
app.get('/list-files', (req, res) => {
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            console.error('无法扫描目录：', err);
            return res.status(500).send('无法扫描目录：' + err);
        }

        const fileList = files
            .filter(file => !file.startsWith('.'))
            .map(file => {
                const filePath = path.join(directoryPath, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    mtime: stats.mtime.getTime()
                };
            });

        fileList.sort((a, b) => b.mtime - a.mtime);
        // console.log('发送的文件列表：', fileList);
        res.json(fileList);
    });
});

// 获取指定文件内容
app.get('/file-content', (req, res) => {
    const fileName = req.query.name;

    if (!fileName) {
        return res.status(400).send('未提供文件名');
    }

    const sanitizedFileName = path.basename(fileName);
    const filePath = path.join(directoryPath, sanitizedFileName);

    // console.log('实际文件路径：', filePath);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('读取文件出错：', err);
            return res.status(500).send('无法读取文件：' + err);
        }
        res.send(data);
        // console.log(data);
});
});

// 启动服务器
app.listen(3000, () => {
    console.log('服务器已启动：http://localhost:3000');
});

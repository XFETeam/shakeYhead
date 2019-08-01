import React, {Component} from 'react';
import * as tf from '@tensorflow/tfjs';
import * as posenet from "@tensorflow-models/posenet";
import './index.scss'

class Pose extends Component {
    constructor(props) {
        super(props);
        this.const = {
            accuracy: 0.85,
            ifRenderCamera: false,
            catchRate: 100,
            template: ['pose11.jpeg', 'pose12.jpeg', 'pose13.jpeg']
        };
        this.state = {
            template: 'pose11.jpeg',
            templateIndex: 0,
            meter: 0,
            streamInfoWarn: false,
            streamInfoDown: false,
            tolong: false,
            catching: false
        }
    }

    render() {
        return (
            <div className={'pose'}>
                <div className="template">
                    <img id={'pose'} src={require('./' + this.const.template[this.state.templateIndex])} alt="pose"/>
                    <canvas id="cvsTemplate" className={this.state.tolong ? 'tolong' : ''}/>
                    <div className="meter">
                        <div className="content">相似度:{(this.state.meter * 100).toFixed(3)}%</div>
                        <div className="status" style={{
                            transform: 'scaleX(' + this.state.meter + ')',
                            background: this.state.meter > this.const.accuracy ? '#4fc08d' : '#f66',
                        }}/>
                        <div className="status-grides">
                            {Array.apply(null, {length: 25}).map((e, i) => (
                                <i key={i} style={{
                                    left: 'calc(' + 3 * i + '% + ' + i + 'px)'
                                }}/>))}
                        </div>
                    </div>
                </div>
                <div className="stream">
                    <div className="stream-static"/>
                    <div className="stream-view">
                        <video height="224" width="224" muted playsInline autoPlay id={'webcam'}/>
                        <canvas id="cvsView"/>
                    </div>
                    <div className="stream-panel">
                        <div className={'console'}>
                            <span
                                className={['info', (this.state.streamInfoWarn || this.state.streamInfoDown) ? 'act' : '', this.state.streamInfoDown ? 'down' : ''].join(' ')}>
                                {this.state.streamInfoWarn && '距离屏幕稍远一些，让身体更多部分进入镜头'}
                                {this.state.streamInfoDown && '匹配成功'}
                            </span>
                        </div>
                        <div className="control">
                            <button onClick={() => this.catch()} className={this.state.catching ? 'act' : ''}>开始
                            </button>
                            <button onClick={() => {
                                clearInterval(this.timer);
                                this.setState({catching: false})
                            }}>暂停
                            </button>
                            <button onClick={() => this.exchange()}>切换
                            </button>
                            <button onClick={() => this.upload()}>上传 <input id={'uploadPic'} type="file"/></button>
                        </div>

                    </div>
                </div>
            </div>
        );
    }

    async init() {
        this.adaptive();
        this.posenet = await posenet.load();
        await this.templateInit();
        await this.streamInit()
    }

    // 适配
    adaptive() {
        document.getElementById('pose').onload = (e) => {
            if (e.target.height > 500) this.setState({tolong: true});
            else this.setState({tolong: false})
        }
    }

    // 模版初始化
    async templateInit() {
        // 常量
        const templateEle = document.getElementById('pose');
        const templateCvs = document.getElementById('cvsTemplate');
        const templatePoseData = await this.getPoseData(templateEle);
        // 绘制
        this.draw(templateEle, templatePoseData, templateCvs, true);
        // 向量
        this.templateVec = await this.getPoseVector(templatePoseData)
    }

    // 流媒体初始化
    async streamInit() {
        // // 摄像初始化
        this.webcamSetpu();
        // // 捕捉
        // this.catch()
    }

    // 解析姿势
    async getPoseData(target) {
        const poses = await this.posenet.estimateMultiplePoses(target, 0.5, false, 16, 2);
        if (poses[0]) return poses[0].keypoints;
        // eslint-disable-next-line
        else throw ('未检测到动作数据')
    }

    // 向量化
    async getPoseVector(target) {
        return new Promise(resolve => {
            let vec = [];
            target.map(async (point, i) => {
                vec = vec.concat(Object.values(point.position));
                if (i === target.length - 1) resolve(vec)
            })
        })
    }

    // 余弦近似
    getVecSimi = async (a, b) => {
        const x = tf.tensor1d(a);
        const y = tf.tensor1d(b);
        const p1 = tf.sqrt(x.mul(x).sum());
        const p2 = tf.sqrt(y.mul(y).sum());
        let p12 = x.mul(y).sum();
        let score = p12.div(p1.mul(p2));
        score = ((await score.data())[0] - 0.9) * 10;
        if (score < 0) score = 0;
        score = Number(score.toString().slice(0, 7));
        this.setState({meter: score});

        if (score > this.const.accuracy) {
            clearInterval(this.timer);
            this.setState({streamInfoDown: true})
        }

    };

    // 绘制
    draw(img, points, container, ifDraw) {
        const cvs = container;
        const ctx = cvs.getContext('2d');
        cvs.height = img.height;
        cvs.width = img.width;
        ctx.font = "12px";
        ctx.clearRect(0, 0, cvs.height, cvs.width);
        if (ifDraw) ctx.drawImage(img, 0, 0);
        // eslint-disable-next-line
        points.map(point => {
            ctx.fillStyle = "#42b983";
            if (point.score < 0.3) ctx.fillStyle = '#f66';
            ctx.fillRect(point.position.x, point.position.y, 5, 5);
            ctx.fill();
        });
    }

    // 摄像驱动
    webcamSetpu() {
        const element = document.getElementById('webcam');
        return new Promise((resolve, reject) => {
            const navigatorAny = navigator;
            navigator.getUserMedia = navigator.getUserMedia || navigatorAny.webkitGetUserMedia || navigatorAny.mozGetUserMedia || navigatorAny.msGetUserMedia;
            if (navigator.getUserMedia) {
                navigator.getUserMedia({video: true}, stream => {
                    element.srcObject = stream;
                    element.addEventListener('loadeddata', () => resolve(), false)
                }, error => reject(error))
            } else reject('摄像设备初始化失败')
        })
    }

    // 动态捕捉
    catch() {
        if (this.state.catching) return;
        this.setState({catching: true});
        clearInterval(this.timer);
        setTimeout(async () => {
            this.timer = setInterval(async () => {
                const streamEle = document.getElementById('webcam');
                const streamPoseData = await this.getPoseData(streamEle);
                if (streamPoseData.filter(pose => pose.score > 0.3).length < 10) this.setState({streamInfo: true});
                else this.setState({streamInfo: false});
                const streamCvs = document.getElementById('cvsView');
                this.draw(streamEle, streamPoseData, streamCvs, this.const.ifRenderCamera);
                const streamVec = await this.getPoseVector(streamPoseData);
                await this.getVecSimi(this.templateVec, streamVec)
            }, this.const.catchRate)
        }, 100);
    }

    // 切换
    exchange() {
        let index = this.state.templateIndex;
        if (index >= this.const.template.length - 1) index = 0;
        else index = index + 1;
        this.setState({templateIndex: index});
        this.init()
    }

    // 上传
    upload() {
        let element = document.getElementById('uploadPic');
        element.onchange = (e) => {
            if (e.target.files) this.reads(e.target.files[0])
        };
        element.click()
    }

    // 读取文件
    reads(file) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            let staticEle = document.createElement('img');
            let staticCvs = document.createElement('canvas');
            let container = document.querySelector('.stream-static');
            staticEle.src = e.target.result;
            staticEle.style.display = 'none';
            staticCvs.style.width = '100%';
            container.appendChild(staticEle);
            container.appendChild(staticCvs);
            staticEle.onload = async () => {
                let staticPoseData = await this.getPoseData(staticEle);
                this.draw(staticEle, staticPoseData, staticCvs, true);
                const staticVec = await this.getPoseVector(staticPoseData);
                await this.getVecSimi(this.templateVec, staticVec)
            }
        }
    }

    componentDidMount() {
        this.init()
    }
}

export default Pose;
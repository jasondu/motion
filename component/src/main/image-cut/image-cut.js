define(function(require, exports, module) {
    require('../motion/motion.js');
    require('../base/base.js');
    require('../../resource/quark.base-1.0.0.js');
    require('../../resource/binaryajax.js');
    require('../../resource/exif.js');
    require('../../resource/jpeg_encoder_basic.js');

    Motion.add('mo.ImageCut:mo.Base', function() {
        /**
         * public 作用域
         * @alias mo.ImageEditor#
         * @ignore
         */
        var _public = this;

        var _private = {};

        /**
         * public static作用域
         * @alias mo.ImageEditor.
         * @ignore
         */
        var _static = this.constructor;
        // 插件默认配置
        _static.config = {
            width: 320,
            height: 320,
            fps: 60
        };


        /***
         * 初始化
         * @description 参数处理
         */
        _public.init = function(config) {
            this.config = Zepto.extend(true, {}, _static.config, config); // 参数接收

            var self = this;
            var config = self.config;

            // 自定义事件绑定
            self.effect && self.on(self.effect);
            config.event && self.on(config.event);

            /**
             * @event mo.ImageCut#beforeinit
             * @property {object} event 开始初始化前
             */
            if (self.trigger('beforeinit') === false) {
                return;
            }

            // 创建canvas
            var canvas = Quark.createDOM('canvas', {
                width: config.width,
                height: config.height,
                style: {
                    backgroundColor: "#000"
                }
            });
            canvas = $(canvas).appendTo(config.container)[0];
            
            var context = new Quark.CanvasContext({
                canvas: canvas
            });

            /**
             * 舞台
             * @name mo.ImageEditor#stage
             * @type quark object
             */
            self.stage = new Quark.Stage({
                width: config.width,
                height: config.height,
                context: context
            });
            self.canvas = canvas;

            /**
             * canvas context
             * @name mo.ImageEditor#context
             * @type  object
             */
            self.context = context;

            // register stage events
            var em = this.em = new Quark.EventManager();
            em.registerStage(self.stage, ['touchstart', 'touchmove', 'touchend'], true, true);
            self.stage.stageX = config.stageX !== window.undefined ? config.stageX : self.stage.stageX;
            self.stage.stageY = config.stageY !== window.undefined ? config.stageY : self.stage.stageY;

            var timer = new Quark.Timer(1000 / config.fps);
            timer.addListener(self.stage);
            timer.addListener(Quark.Tween);
            timer.start();

            _private.attach.call(self);
        };

        _private.attach = function () {
            var self = this;
            var config = self.config;

            config.trigger.on('change', function(e) {

                /**
                 * @event mo.ImageEditor#beforechange
                 * @property {object} event 选择完文件准备读取前
                 */
                self.trigger('beforechange');

                // 只上传一个文件
                var file = this.files[0];


                // 限制上传图片文件
                if (file.type && !/image\/\w+/.test(file.type)) {
                    alert('请选择图片文件！');
                    return false;
                }

                var fr = new FileReader();
                fr.readAsDataURL(file);



                fr.onload = function(fe) {
                    var result = this.result;
                    var img = new Image();
                    var exif;
                    img.onload = function() {
                        self.addImage({
                            img: img,
                            exif: exif
                        });

                        /**
                         * @event mo.ImageEditor#change
                         * @property {object} 文件选择完毕时
                         */
                        self.trigger('change');
                    };
                    // 转换二进制数据
                    var base64 = result.replace(/^.*?,/, '');
                    var binary = atob(base64);
                    var binaryData = new BinaryFile(binary);

                    // get EXIF data
                    exif = EXIF.readFromBinaryFile(binaryData);

                    img.src = result;

                };

            });

            self.stage.addEventListener('touchstart', function(e) {
                self.imgStart(e);
            });
            self.stage.addEventListener('touchmove', function(e) {
                self.imgMove(e);
            });
            self.stage.addEventListener('touchend', function(e) {
                self.imgEnd(e);
            });
        };
        _public.addImage = function (info) {
            var self = this;
            var config = self.config;
            this.img = info.img;
            var exif = info.exif;
            var mcScale;
            var mcClose;
            var imgWidth = this.img.width;
            var imgHeight = this.img.height;
            var imgRotation = 0;
            var imgRegX = 0;
            var imgRegY = 0;
            var imgX = 0;
            var imgY = 0;
            var posX = info.pos ? info.pos[0] : (self.config.width - imgWidth) / 2;
            var posY = info.pos ? info.pos[1] : (self.config.height - imgHeight) / 2;
            var imgScale = 1;
            var orientation = exif ? exif.Orientation : 1;

            var getRatio = function(img) {
                if (/png$/i.test(img.src)) {
                    return 1;
                }
                var iw = img.naturalWidth,
                    ih = img.naturalHeight;
                var canvas = document.createElement('canvas');
                canvas.width = 1;
                canvas.height = ih;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                var data = ctx.getImageData(0, 0, 1, ih).data;
                var sy = 0;
                var ey = ih;
                var py = ih;
                while (py > sy) {
                    var alpha = data[(py - 1) * 4 + 3];
                    if (alpha === 0) {
                        ey = py;
                    } else {
                        sy = py;
                    }
                    py = (ey + sy) >> 1;
                }
                var ratio = (py / ih);
                return (ratio === 0) ? 1 : ratio;
            }
            var ratio = getRatio(this.img);

            if (typeof this.img == 'string') {
                var url = this.img;
                this.img = new Image();
                this.img.src = url;
            }


            // 判断拍照设备持有方向调整照片角度
            switch (orientation) {
                case 3:
                    imgRotation = 180;
                    imgRegX = imgWidth;
                    imgRegY = imgHeight * ratio;
                    // imgRegY -= imgWidth * (1-ratio);
                    break;
                case 6:

                    imgRotation = 90;
                    imgWidth = this.img.height;
                    imgHeight = this.img.width;
                    imgRegY = imgWidth * ratio;
                    // imgRegY -= imgWidth * (1-ratio);
                    break;
                case 8:
                    imgRotation = 270;
                    imgWidth = this.img.height;
                    imgHeight = this.img.width;
                    imgRegX = imgHeight * ratio;

                    if (/iphone|ipod|ipad/i.test(navigator.userAgent)) {
                        alert('苹果系统下暂不支持你以这么萌！萌！达！姿势拍照！');
                        return;
                    }

                    break;


            }
            imgWidth *= ratio;
            imgHeight *= ratio;


            if (imgWidth > self.stage.width) {
                imgScale = self.stage.width / imgWidth;
            }

            imgWidth = imgWidth * imgScale;
            imgHeight = imgHeight * imgScale;

            this.imgContainer = new Quark.DisplayObjectContainer({
                width: imgWidth,
                height: imgHeight
            });
            this.imgContainer.x = posX;
            this.imgContainer.y = posY;

            this.img = new Quark.Bitmap({
                image: this.img,
                regX: imgRegX,
                regY: imgRegY
            });
            this.img.rotation = imgRotation;
            this.img.x = imgX;
            this.img.y = 0;
            // img.scaleX = imgScale * ratio;
            this.img.scaleX = imgScale;
            this.img.scaleY = imgScale;


            this.img.update = function() {
                if (this.imgContainer && this.imgContainer.scaleX) {
                    if (mcClose && mcClose.scaleX) {
                        mcClose.scaleX = 1 / this.imgContainer.scaleX;
                        mcClose.scaleY = 1 / this.imgContainer.scaleY;
                        mcClose.x = 0;
                    }
                }

            };
            this.imgContainer.addChild(this.img);
            self.stage.addChild(this.imgContainer);

            if (self.imgs) {
                self.imgs.push(this.imgContainer);
            } else {
                self.imgs = [this.imgContainer];
            }

            var mask_1 = new Q.Graphics({
                width: self.config.width + 5,
                height: self.config.height,
                x: -5,
                y: -5
            });
            mask_1.lineStyle(5, "#fff").beginFill("#000", 0.5).drawRect(5, 5, self.config.width, (self.config.height - self.config.markHeight) / 2).endFill().cache();
            mask_1.alpha = 0.5;
            self.stage.addChild(mask_1);
            self.imgs.push(mask_1);

            var mask_2 = new Q.Graphics({
                width: self.config.width + 5,
                height: self.config.height,
                x: -5,
                y: ((self.config.height + self.config.markHeight) / 2) - 5
            });
            mask_2.lineStyle(5, "#fff").beginFill("#000", 0.5).drawRect(5, 5, self.config.width, (self.config.height - self.config.markHeight) / 2).endFill().cache();
            mask_2.alpha = 0.5;
            self.stage.addChild(mask_2);
            self.imgs.push(mask_2);

            var mask_3 = new Q.Graphics({
                width: self.config.width + 5,
                height: self.config.markHeight + 5,
                x: -5,
                y: ((self.config.height - self.config.markHeight) / 2) - 2.5
            });
            mask_3.lineStyle(5, "#fff").beginFill("#000", 0.5).drawRect(5, 5, 0, self.config.markHeight - 5).endFill().cache();
            mask_3.alpha = 0.5;
            self.stage.addChild(mask_3);
            self.imgs.push(mask_3);

            var mask_4 = new Q.Graphics({
                width: self.config.width + 5,
                height: self.config.markHeight + 5,
                x: self.config.width -5,
                y: ((self.config.height - self.config.markHeight) / 2) - 2.5
            });
            mask_4.lineStyle(5, "#fff").beginFill("#000", 0.5).drawRect(5, 5, 0, self.config.markHeight - 5).endFill().cache();
            mask_4.alpha = 0.5;
            self.stage.addChild(mask_4);
            self.imgs.push(mask_4);

            window.stage = self.stage;
        };

        _public.imgStart = function (e) {
            var self = this;
            var isMultiTouch = e.rawEvent && e.rawEvent.touches[1];

            if(!isMultiTouch){
                // 记录单指
                this.img.curW = this.imgContainer.getCurrentWidth();
                this.img.curH = this.imgContainer.getCurrentHeight();
                this.img.moveabled = true;
                this.img.touchStart = [{
                    'x': e.eventX,
                    'y': e.eventY
                }];
                delete this.img.startScaleDistance;
            }else{
                // 记录两指
                var touch1 = e.rawEvent.touches[0];
                var touch2 = e.rawEvent.touches[1];
                this.img.startScaleDistance = Math.sqrt(Math.pow(touch2.pageX - touch1.pageX, 2) + Math.pow(touch2.pageY - touch1.pageY, 2));
                this.img.touchStart = [{
                    'x': touch1.pageX,
                    'y': touch1.pageY
                },
                    {
                        'x': touch2.pageX,
                        'y': touch2.pageY
                    }];
                // 专供双指旋转使用的，不会被fnMove改变值
                this.img.touchStartScale = [{
                    'x': touch1.pageX,
                    'y': touch1.pageY
                },
                    {
                        'x': touch2.pageX,
                        'y': touch2.pageY
                    }];
                this.img.imgContainerStartRotation = this.imgContainer.rotation;

                /* 核心功能：将imgContainer的reg坐标放到双指中间，以支持按双指中心移动缩放旋转的效果 start */

                // 1.计算触控中心点，在屏幕中的位置
                var touches = this.img.touchStart;
                var nCenterPoint = {'x':0, 'y':0};
                for (var i = 0; i < touches.length; i++) {
                    nCenterPoint.x += touches[i].x
                    nCenterPoint.y += touches[i].y;
                }
                nCenterPoint.x /= touches.length;
                nCenterPoint.y /= touches.length;


                // 2.触控中心点，在canvas中的位置
                nCenterPoint.x -= self.canvas.offsetLeft;
                nCenterPoint.y -= self.canvas.offsetTop;

                // 3.计算图片左上角在canvas中的位置
                var leftUpPiont = {'x':0, 'y':0};
                var dc = Math.sqrt( Math.pow(this.imgContainer.regX * this.imgContainer.scaleX, 2) + Math.pow(this.imgContainer.regY * this.imgContainer.scaleY, 2) );
                var r = Math.atan2(this.imgContainer.regY, this.imgContainer.regX);
                r = 180 / Math.PI * r;
                leftUpPiont.x = this.imgContainer.x - Math.cos( Math.PI * (this.imgContainer.rotation + r) / 180 ) * dc;
                leftUpPiont.y = this.imgContainer.y - Math.sin( Math.PI * (this.imgContainer.rotation + r) / 180 ) * dc;

                // 4.触控中心点，离左上角中的距离
                nCenterPoint.x -= leftUpPiont.x;
                nCenterPoint.y -= leftUpPiont.y;

                // 移动reg坐标到中心点这里，计算触控中心点相当于图片的内部坐标
                var dc = Math.sqrt( Math.pow(nCenterPoint.x, 2) + Math.pow(nCenterPoint.y, 2) );
                var r = Math.atan2(nCenterPoint.y, nCenterPoint.x);
                r = 180 / Math.PI * r;
                var newRegX = dc * Math.cos( Math.PI * (r - this.imgContainer.rotation ) / 180) / this.imgContainer.scaleX;
                var newRegY = dc * Math.sin( Math.PI * (r - this.imgContainer.rotation ) / 180) / this.imgContainer.scaleY;
                //console.log("nc("+nCenterPoint.x+", "+nCenterPoint.y+") r:"+r+" ir:"+this.imgContainer.rotation);

                // 将 imgContainer 的 regx 移动到触控中心
                var dx = newRegX - this.imgContainer.regX;
                var dy = newRegY - this.imgContainer.regY;
                this.imgContainer.regX += dx;
                this.imgContainer.regY += dy;

                // 反向移动一下imgContainer的x和y，以保证图片不会跳动
                var dc = Math.sqrt( Math.pow(dx, 2) + Math.pow(dy, 2) ) ;
                var r = Math.atan2(dy, dx);
                r = 180 / Math.PI * r;
                this.imgContainer.x += dc * Math.cos(Math.PI * (this.imgContainer.rotation + r) / 180) * this.imgContainer.scaleX;
                this.imgContainer.y += dc * Math.sin(Math.PI * (this.imgContainer.rotation + r) / 180) * this.imgContainer.scaleY;
                //console.log("dx("+dx+", "+dy+")");

                /* 核心功能：将imgContainer的reg坐标放到双指中间，以支持按双指中心移动缩放旋转的效果 end */

            }
        };
        _public.imgMove = function(e){

            // 检测记录当前触控信息
            // 1.记录触控坐标的数组
            var touches = [];
            // 2.是否多指
            var isMultiTouch = this.img.touchStart.length > 1 ? true : false;
            if(!isMultiTouch){
                touches = [{
                    'x': e.eventX,
                    'y': e.eventY
                }];
            }else{
                touches = [{
                    'x': e.rawEvent.touches[0].pageX,
                    'y': e.rawEvent.touches[0].pageY
                },
                    {
                        'x': e.rawEvent.touches[1].pageX,
                        'y': e.rawEvent.touches[1].pageY
                    }];
            }

            // 以下是三个支持多指操作的功能，缩放，移动，旋转
            // 双指缩放图片
            if(isMultiTouch){

                var dis = Math.sqrt(Math.pow(touches[1].x - touches[0].x, 2) + Math.pow(touches[1].y - touches[0].y, 2));
                if (this.img.startScaleDistance) {
                    //console.log("s:"+this.img.startScaleDistance+"n:"+dis+"x:"+this.img.scaleX+"y:"+this.img.scaleY);
                    var newScale = dis * this.imgContainer.scaleX / this.img.startScaleDistance;
                    this.imgContainer.scaleX = newScale;
                    this.imgContainer.scaleY = newScale;

                }
                this.img.startScaleDistance = dis;
            }

            // 移动图片
            if(this.img.moveabled){
                // 将所有触点的移动距离加起来
                var disX = 0, disY = 0;
                for (var i = 0; i < touches.length; i++) {
                    disX += touches[i].x - this.img.touchStart[i].x;
                    disY += touches[i].y - this.img.touchStart[i].y;
                };
                disX = disX / touches.length;
                disY = disY / touches.length;


                this.imgContainer.x += disX;
                this.imgContainer.y += disY;

                //console.log(disX+":"+disY);
                //console.log(img.touchStart[0].x+":"+img.touchStart[0].y);
                //console.log(touches[0].x+":"+touches[0].y);

                this.img.touchStart = touches;
            }


        };
        _public.imgEnd = function(e){
            this.img.moveabled = false;
            /*
             * 此处也要记录，是避免此种情况：
             * 1指按住的同时，2指离开，此时只会触发touchend，不会触发touchstart
             * 所以touchend也需要更新为单指，否则再移动程序会以为还是双指。
             */
            var isMultiTouch = e.rawEvent && e.rawEvent.touches[1];

            if(!isMultiTouch){
                // 记录单指
                this.img.curW = this.imgContainer.getCurrentWidth();
                this.img.curH = this.imgContainer.getCurrentHeight();
                this.img.moveabled = true;
                this.img.touchStart = [{
                    'x': e.eventX,
                    'y': e.eventY
                }];
                delete this.img.startScaleDistance;
            }else{
                // 记录两指
                var touch1 = e.rawEvent.touches[0];
                var touch2 = e.rawEvent.touches[1];
                this.img.startScaleDistance = Math.sqrt(Math.pow(touch2.pageX - touch1.pageX, 2) + Math.pow(touch2.pageY - touch1.pageY, 2));
                this.img.touchStart = [{
                    'x': touch1.pageX,
                    'y': touch1.pageY
                },
                    {
                        'x': touch2.pageX,
                        'y': touch2.pageY
                    }];

            }

        };
        /**
         * 清除画布
         */
        _public.clear = function() {
            if (this.imgs) {
                for (var i = 0; i < this.imgs.length; i++) {
                    this.stage.removeChild(this.imgs[i]);
                }
            }
        };


        /**
         * 导出base64数据
         */
        _public.toDataURL  = function(options, callback) {
            var self = this;

            var x = options.x || 0;
            var y = options.y || 0;
            var width = options.width || self.stage.width;
            var height = options.height || self.stage.height;

            // 已测手机QQ浏览器canvas.toDataURL有问题，使用jeegEncoder
            window.setTimeout(function() {
                var  encoder  =  new  JPEGEncoder();
                var data =  encoder.encode(self.canvas.getContext('2d').getImageData(x, y, width, height),  90);
                callback.call(self, data);
            }, 1000 / self.config.fps)
        }

    });

});
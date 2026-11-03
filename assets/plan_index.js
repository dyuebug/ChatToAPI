/**
 * OpenClaw Home Logic
 * 仅包含首页特有的视频控制逻辑
 * Layout 逻辑已移至 layout.js
 */

const initVideo = () => {
    const $container = $('#demoVideo');
    if (!$container.length) return;

    const video = $container.find('video')[0];
    const $overlay = $container.find('.video-overlay');
    const $playBtn = $container.find('.play-toggle');
    const $muteBtn = $container.find('.mute-toggle');
    const $fullBtn = $container.find('.fullscreen-toggle');
    const $speedSelect = $container.find('.speed-select');

    // Play/Pause
    const togglePlay = () => {
        if (video.paused) {
            video.play();
            $overlay.addClass('hidden');
            $playBtn.html('<svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>');
        } else {
            video.pause();
            $overlay.removeClass('hidden');
            $playBtn.html('<svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>');
        }
    };

    $playBtn.on('click', togglePlay);
    $overlay.on('click', togglePlay);

    $(video).on('play', () => {
        $overlay.addClass('hidden');
        $playBtn.html('<svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>');
    });

    $(video).on('pause', () => {
        $overlay.removeClass('hidden');
        $playBtn.html('<svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>');
    });

    // Mute
    $muteBtn.on('click', () => {
        video.muted = !video.muted;
        if (video.muted) {
            $muteBtn.html('<svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>');
        } else {
            $muteBtn.html('<svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>');
        }
    });

    // Speed
    $speedSelect.on('change', (e) => {
        video.playbackRate = parseFloat($(e.target).val());
    });

    // Fullscreen
    $fullBtn.on('click', () => {
        if (video.requestFullscreen) {
            video.requestFullscreen();
        } else if (video.webkitRequestFullscreen) { /* Safari */
            video.webkitRequestFullscreen();
        } else if (video.msRequestFullscreen) { /* IE11 */
            video.msRequestFullscreen();
        }
    });
};

const aiCarouselData = [
    {
        name: 'ChatGPT',
        platform: 'OpenAI',
        icon: '<svg t="1774317062039" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4011" width="40px" height="40px"><path d="M815.616 0H208.384C93.3 0 0 94.068 0 210.083v603.834C0 929.955 93.3 1024 208.384 1024h607.232C930.7 1024 1024 929.955 1024 813.917V210.083C1024 94.068 930.7 0 815.616 0z" fill="#10a37f" p-id="4012"></path><path d="M757.364 460.032A142.825 142.825 0 0 0 745.1 342.807a144.407 144.407 0 0 0-155.462-69.26 142.708 142.708 0 0 0-106.729-47.988h-1.257a144.384 144.384 0 0 0-137.355 99.933 142.755 142.755 0 0 0-95.418 69.237 144.43 144.43 0 0 0 17.757 169.262 142.825 142.825 0 0 0 12.241 117.202 144.384 144.384 0 0 0 155.462 69.26A142.755 142.755 0 0 0 541.09 798.44h1.28a144.337 144.337 0 0 0 137.356-100.003 142.732 142.732 0 0 0 95.418-69.237 144.198 144.198 0 0 0-17.78-169.192zM542.022 760.995h-0.163a107.148 107.148 0 0 1-68.562-24.855 69.857 69.857 0 0 0 3.375-1.932l114.06-65.862a18.548 18.548 0 0 0 9.379-16.128v-160.93l48.22 27.833a1.722 1.722 0 0 1 0.932 1.327v133.19a107.497 107.497 0 0 1-107.241 107.357z m-230.68-98.514a107.148 107.148 0 0 1-12.8-71.936l3.398 2.002 114.037 65.885a18.595 18.595 0 0 0 18.758 0l139.264-80.407v55.784a1.745 1.745 0 0 1-0.699 1.374l-115.293 66.56a107.567 107.567 0 0 1-107.334 0 107.497 107.497 0 0 1-39.33-39.285z m-29.998-249.018a106.985 106.985 0 0 1 55.878-47.08l-0.047 3.956v131.84a18.525 18.525 0 0 0 9.356 16.105l139.264 80.407-48.221 27.834a1.745 1.745 0 0 1-1.63 0.14l-115.316-66.63a107.497 107.497 0 0 1-39.284-146.595z m396.102 92.16l-139.24-80.384 48.197-27.834a1.722 1.722 0 0 1 1.629-0.163l115.316 66.583a107.427 107.427 0 0 1-16.593 193.746V521.704a18.525 18.525 0 0 0-9.31-16.057z m47.988-72.215a171.055 171.055 0 0 0-3.374-2.025L608 365.521a18.618 18.618 0 0 0-18.758 0l-139.24 80.384v-55.761c0-0.535 0.232-1.07 0.698-1.396l115.293-66.514a107.38 107.38 0 0 1 159.441 111.174z m-301.638 99.235l-48.22-27.834a1.699 1.699 0 0 1-0.932-1.327V370.316a107.38 107.38 0 0 1 176.059-82.456 97.135 97.135 0 0 0-3.375 1.932l-114.083 65.885a18.572 18.572 0 0 0-9.356 16.105v0.116l-0.093 160.745z m26.205-56.46L512 440.343l62.022 35.817v71.633L512 583.587l-62.022-35.794V476.16z" fill="#FFFFFF" p-id="4013"></path></svg>',
        desc: '像一个真正理解你的超级助手，逻辑严谨、对话自然，无论写作、编程还是复杂问题拆解，都能给出让人惊艳的答案。',
        tags: ['多轮对话王者', '逻辑与表达兼备', '全能型AI']
    },
    {
        name: 'Claude',
        platform: 'Anthropic',
        icon: '<svg t="1774316894104" viewBox="0 0 1067 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1638" width="40px" height="40px"><path d="M301.627733 587.842811h167.377239l-87.175646-219.682626-80.201593 219.682626z" fill="#EFB96A" p-id="1639"></path><path d="M957.920861 0H109.109038C48.853232 0 0 48.853232 0 109.109038v805.781924c0 60.255806 48.853232 109.109038 109.109038 109.109038h848.811823c60.255806 0 109.109038-48.853232 109.109038-109.109038V109.109038C1067.029899 48.853232 1018.176667 0 957.920861 0zM573.615746 845.882722l-48.818361-134.250494H254.552884l-57.535926 134.250494H47.074848l258.039911-650.330314h155.172648l258.03991 650.330314h-144.711571z m258.03991 0l-247.578832-641.61275v-8.717564h134.250493l261.526936 650.330314h-148.198597z" fill="#EFB96A" p-id="1640"></path></svg>',
        desc: '天生擅长“读懂一切”的AI，大段内容也能轻松消化，理解深度极强，总能给出温和又极具洞察力的回应。',
        tags: ['长文本理解强', '思考细腻深入', '代码王者']
    },
    {
        name: 'Gemini',
        platform: 'Google',
        icon: '<svg t="1774317734305" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8279" width="40px" height="40px"><path d="M474.624 46.506667h74.709333l2.218667 36.48a415.701333 415.701333 0 0 0 389.461333 389.461333l36.437334 2.218667v74.666666l-36.437334 2.218667a415.701333 415.701333 0 0 0-389.461333 389.461333l-2.218667 36.48h-74.666666l-2.218667-36.48a415.701333 415.701333 0 0 0-389.461333-389.461333l-36.437334-2.176v-74.709333l36.437334-2.218667a415.701333 415.701333 0 0 0 389.461333-389.461333l2.176-36.437334zM512 249.6A494.890667 494.890667 0 0 1 249.6 512 494.933333 494.933333 0 0 1 512 774.4 494.890667 494.890667 0 0 1 774.4 512 494.848 494.848 0 0 1 512 249.6z" fill="#4285f4" p-id="8280"></path></svg>',
        desc: '融合多种能力的全能选手，不止会聊天，还能理解世界的多种信息形式，像一个真正“看懂世界”的AI。',
        tags: ['多模态能力强', '信息理解全面', '生态联动强']
    },
    {
        name: 'Grok',
        platform: 'xAI',
        icon: '<svg t="1774317010957" viewBox="0 0 1028 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2724" width="40px" height="40px"><path d="M40.62084 40.609642c-54.14619 54.14619-54.14619 888.634526 0 942.780716 54.14619 54.14619 888.634526 54.14619 942.780715 0 54.14619-54.14619 54.14619-888.634526 0-942.780716C929.255365-13.536547 94.76703-13.536547 40.62084 40.609642z m738.936236 203.844479c9.55521 28.66563 19.11042 171.993779 19.11042 321.692069 0 238.880249-6.37014 267.545879-54.14619 257.990668-76.44168-12.74028-95.5521-296.211509-28.665629-452.279937 25.48056-63.7014 44.59098-114.662519 38.220839-114.66252-6.37014 0-57.33126 70.07154-117.847589 159.253499-60.51633 85.99689-117.847589 159.253499-130.587869 159.2535-63.7014 0-47.77605-79.62675 44.590979-219.769829 105.107309-162.438569 194.289269-203.844479 229.325039-111.47745zM473.790358 607.5521c152.883359 213.399689 156.068429 222.954899 79.626749 222.954898-31.8507 0-92.36703-54.14619-136.958009-117.847589C199.874339 387.782271 212.614619 416.4479 279.501089 416.4479c38.22084 0 111.477449 70.07154 194.289269 191.1042z m-98.73717 171.993779c-12.74028 28.66563-50.96112 50.96112-85.996889 50.961119-63.7014 0-63.7014-3.18507-12.74028-82.811819 57.33126-85.99689 133.772939-60.51633 98.737169 31.8507z" p-id="2725" fill="#111"></path></svg>',
        desc: '思维敏捷、理解透彻，更加人性化、对新信息极其敏感，回答往往带点锋芒和个性，是一个“有态度”的AI。',
        tags: ['实时信息敏锐', '回答大胆直接', '表达自然流畅']
    }
];

const initAICarousel = () => {
    const $wrapper = $('#aiCarouselWrapper');
    const $dotsContainer = $('#aiShowcaseDots');
    
    if (!$wrapper.length) return;

    layui.use('laytpl', function () {
        var laytpl = layui.laytpl;
        var carouselTpl = document.getElementById('aiCarouselTpl').innerHTML;
        
        laytpl(carouselTpl).render(aiCarouselData, function(html){
            $wrapper.html(html);
            if ($dotsContainer.length) {
                var dotsTpl = document.getElementById('aiDotsTpl').innerHTML;
                laytpl(dotsTpl).render(aiCarouselData, function(dotsHtml){
                    $dotsContainer.html(dotsHtml);
                    bindCarouselEvents();
                });
            } else {
                bindCarouselEvents();
            }
        });
    });

    const bindCarouselEvents = () => {
        const $slides = $('.ai-slide');
        const $dots = $('.ai-showcase-dots span');
        const $navLeft = $('.ai-showcase-nav.left, .ai-showcase-nav.top');
        const $navRight = $('.ai-showcase-nav.right, .ai-showcase-nav.bottom');

        if (!$slides.length) return;

        let currentIndex = 0;
        const totalSlides = $slides.length;
        let autoPlayTimer;

        const showSlide = (index) => {
            let nextIndex = index;
            if (nextIndex < 0) nextIndex = totalSlides - 1;
            if (nextIndex >= totalSlides) nextIndex = 0;

            currentIndex = nextIndex;

            $slides.each((i, el) => {
                const $el = $(el);
                $el.removeClass('active prev next hidden-left hidden-right');

                if (i === currentIndex) {
                    $el.addClass('active');
                } else if (i === (currentIndex - 1 + totalSlides) % totalSlides) {
                    $el.addClass('prev');
                } else if (i === (currentIndex + 1) % totalSlides) {
                    $el.addClass('next');
                } else {
                    let diff = i - currentIndex;
                    if (diff < -totalSlides / 2) diff += totalSlides;
                    if (diff > totalSlides / 2) diff -= totalSlides;

                    if (diff < 0) {
                        $el.addClass('hidden-left');
                    } else {
                        $el.addClass('hidden-right');
                    }
                }
            });

            $dots.removeClass('active').eq(currentIndex).addClass('active');
        };

        showSlide(0);

        const nextSlide = () => showSlide(currentIndex + 1);
        const prevSlide = () => showSlide(currentIndex - 1);

        const startAutoPlay = () => {
            stopAutoPlay();
            autoPlayTimer = setInterval(nextSlide, 5000);
        };

        const stopAutoPlay = () => {
            if (autoPlayTimer) clearInterval(autoPlayTimer);
        };

        $navRight.on('click', () => { nextSlide(); startAutoPlay(); });
        $navLeft.on('click', () => { prevSlide(); startAutoPlay(); });

        $dots.on('click', function () {
            showSlide($(this).index());
            startAutoPlay();
        });

        $(document).off('click', '.ai-slide').on('click', '.ai-slide', function (e) {
            if ($(this).hasClass('active')) return;
            e.preventDefault();
            e.stopPropagation();
            showSlide($(this).index('.ai-slide'));
            startAutoPlay();
        });

        // 针对 3D 轮播图中活跃幻灯片遮挡两侧非活跃幻灯片点击事件的补充处理
        $wrapper.off('click').on('click', function (e) {
            // 忽略导航按钮和分页点的点击
            if ($(e.target).closest('.ai-showcase-nav, .ai-showcase-dots').length) return;

            const $slide = $(e.target).closest('.ai-slide');
            // 如果直接点击到了非活跃的 slide（没有被遮挡），已经在上面处理了
            if ($slide.length && !$slide.hasClass('active')) return;

            // 如果点击的是 active 的 slide 或者是空白区域，根据 X 坐标判断是否在两侧
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (x < rect.width * 0.25) {
                prevSlide();
                startAutoPlay();
            } else if (x > rect.width * 0.75) {
                nextSlide();
                startAutoPlay();
            }
        });

        $('.ai-showcase-card').hover(stopAutoPlay, startAutoPlay);

        startAutoPlay();
    };
};

const initTypewriter = () => {
    $('.typewriter-text').each(function () {
        const $el = $(this);
        const clearMode = $el.data('clear-mode') === true;

        // Check if it has data-texts (array) or data-text (string)
        let texts = [];
        const textsAttr = $el.attr('data-texts');
        if (textsAttr) {
            try {
                texts = JSON.parse(textsAttr);
            } catch (e) {
                texts = [$el.attr('data-text') || ''];
            }
        } else {
            const textAttr = $el.attr('data-text');
            if (!textAttr) return;
            texts = [textAttr];
        }

        if (texts.length === 0) return;

        let textIndex = 0;

        const renderText = () => {
            const currentText = texts[textIndex];
            $el.empty();

            // support newlines by splitting by \n
            const parts = currentText.split('\n');

            let charDelay = 0;
            parts.forEach((part, lineIndex) => {
                if (lineIndex > 0) {
                    $el.append('<br>');
                }
                for (let i = 0; i < part.length; i++) {
                    const char = part[i];
                    if (char === ' ') {
                        $el.append(' ');
                    } else {
                        const $span = $('<span>').text(char).css({
                            opacity: 0,
                            display: 'inline-block',
                            animation: `jumpIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards ${charDelay}s`
                        });
                        $el.append($span);
                        charDelay += 0.05;
                    }
                }
            });

            // Next text (Always loop)
            setTimeout(() => {
                // fade out and next
                $el.children('span').css('animation', 'none').animate({ opacity: 0 }, 300);
                setTimeout(() => {
                    textIndex = (textIndex + 1) % texts.length;
                    renderText();
                }, 300);
            }, charDelay * 1000 + 3000); // Wait 3 seconds after typing
        };

        setTimeout(renderText, 800);
    });
};

$(() => {
    initVideo();
    initAICarousel();
    initTypewriter();

    // 立即试用 按钮跳转逻辑
    $('#btnTryNow').on('click', function(e) {
        e.preventDefault();
        const userId = getUserId();
        if (userId) {
            goToPage('chat.shtml');
        } else {
            showLoginModal();
        }
    });
});
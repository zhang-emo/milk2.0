/**
 * qa.js - 问答功能模块
 * 支持用户自定义问题与3个选项，由对方等概率随机抽取一项进行回复
 * 具备完全独立的回复定时器队列，防止与常规消息回复冲突或相互覆盖
 */

(function() {
    'use strict';

    // 独立的问答回复定时器队列
    window._qaReplyTimers = window._qaReplyTimers || [];

    // 安全 HTML 转义函数
    function escapeQaHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * 渲染问答卡片内部 HTML
     */
    window.renderQaCardHtml = function(msg) {
        if (!msg || !msg.qa) return escapeQaHtml(msg.text || '');

        const question = msg.qa.question || '';
        const options = Array.isArray(msg.qa.options) ? msg.qa.options : [];
        const selected = msg.qa.selectedOption || null;
        const labels = ['A', 'B', 'C'];

        let optionsHtml = '';
        options.forEach(function(opt, idx) {
            const isSelected = selected && selected === opt;
            const optClass = isSelected ? 'qa-card-option is-selected' : 'qa-card-option';
            const checkIcon = isSelected
                ? '<svg class="qa-check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                : '';

            optionsHtml += `
                <div class="${optClass}">
                    <span class="qa-option-label">${labels[idx] || (idx + 1)}</span>
                    <span class="qa-option-text">${escapeQaHtml(opt)}</span>
                    ${checkIcon}
                </div>
            `;
        });

        const statusHtml = selected
            ? `<div class="qa-card-status answered">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <span>对方已选择：${escapeQaHtml(selected)}</span>
               </div>`
            : `<div class="qa-card-status waiting">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>等待对方选择回复中…</span>
               </div>`;

        return `
            <div class="qa-card-body">
                <div class="qa-card-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <span class="qa-card-title">问答互动</span>
                </div>
                <div class="qa-card-question">${escapeQaHtml(question).replace(/\n/g, '<br>')}</div>
                <div class="qa-card-options">${optionsHtml}</div>
                ${statusHtml}
            </div>
        `;
    };

    /**
     * 打开问答配置弹窗
     */
    window.openQaModal = function() {
        const modal = document.getElementById('qa-modal');
        const questionInput = document.getElementById('qa-question-input');
        if (!modal) return;

        // 清理旧输入或保持空白准备输入
        if (questionInput) questionInput.value = '';
        const opt1 = document.getElementById('qa-option-1');
        const opt2 = document.getElementById('qa-option-2');
        const opt3 = document.getElementById('qa-option-3');
        if (opt1) opt1.value = '';
        if (opt2) opt2.value = '';
        if (opt3) opt3.value = '';

        if (typeof showModal === 'function') {
            showModal(modal, questionInput);
        } else {
            modal.style.display = 'flex';
            if (questionInput) setTimeout(() => questionInput.focus(), 100);
        }
    };

    /**
     * 关闭问答配置弹窗
     */
    window.closeQaModal = function() {
        const modal = document.getElementById('qa-modal');
        if (!modal) return;
        if (typeof hideModal === 'function') {
            hideModal(modal);
        } else {
            modal.style.display = 'none';
        }
    };

    /**
     * 独立调度问答回复
     * 不受普通消息 _pendingReplyTimer 的影响与覆盖，同时记录于 _qaReplyTimers 队列
     */
    function scheduleIndependentQaReply(messageId, qaData) {
        // 读取系统当前配置的最小与最大回复延迟范围
        const minDelay = (typeof settings !== 'undefined' && typeof settings.replyDelayMin === 'number')
            ? settings.replyDelayMin
            : 1000;
        const maxDelay = (typeof settings !== 'undefined' && typeof settings.replyDelayMax === 'number')
            ? settings.replyDelayMax
            : 3000;
        const delayRange = Math.max(0, maxDelay - minDelay);
        const randomDelay = minDelay + Math.random() * delayRange;

        // 显示「对方正在输入...」状态提示
        if (typeof window.showTypingIndicator === 'function') {
            window.showTypingIndicator();
        }

        // 建立独立定时器
        const timerId = setTimeout(function() {
            // 从队列中移除当前定时器
            window._qaReplyTimers = (window._qaReplyTimers || []).filter(item => item.id !== timerId);

            const options = (qaData && Array.isArray(qaData.options)) ? qaData.options : [];
            if (!options.length) return;

            // 1/3 等概率抽取其中 1 个选项
            const chosenIndex = Math.floor(Math.random() * options.length);
            const chosenOption = options[chosenIndex];

            // 更新聊天记录中对应卡片的 selectedOption 并标记已读
            if (typeof messages !== 'undefined' && Array.isArray(messages)) {
                const targetMsg = messages.find(m => String(m.id) === String(messageId));
                if (targetMsg) {
                    targetMsg.status = 'read';
                    if (targetMsg.qa) {
                        targetMsg.qa.selectedOption = chosenOption;
                    }
                }
            }

            // 发送一条新的聊天气泡，文字内容为选中的选项原文字
            const partnerName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '对方';
            const partnerReplyMessage = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                sender: partnerName,
                text: chosenOption,
                timestamp: new Date(),
                status: 'received',
                favorited: false,
                note: null,
                type: 'normal'
            };

            if (typeof addMessage === 'function') {
                addMessage(partnerReplyMessage);
            } else if (typeof window.addMessage === 'function') {
                window.addMessage(partnerReplyMessage);
            }

            // 播放接收消息音效
            if (typeof playSound === 'function') {
                playSound('message');
            }

            // 系统通知支持
            if (typeof window._sendPartnerNotification === 'function') {
                window._sendPartnerNotification(partnerName, chosenOption);
            }

            // 若当前无其他未完成的问答或普通待回复消息，则隐藏输入指示器
            const hasOtherQa = (window._qaReplyTimers && window._qaReplyTimers.length > 0);
            const hasPendingRegular = !!window._pendingReplyTimer;
            if (!hasOtherQa && !hasPendingRegular && typeof window.hideTypingIndicator === 'function') {
                window.hideTypingIndicator();
            }

            // 重新渲染视图并保存
            if (typeof renderMessages === 'function') renderMessages(false);
            if (typeof throttledSaveData === 'function') throttledSaveData();
        }, randomDelay);

        window._qaReplyTimers.push({
            id: timerId,
            messageId: messageId,
            scheduledAt: Date.now()
        });
    }

    /**
     * 发送问答
     */
    window.submitQaQuestion = function() {
        const questionInput = document.getElementById('qa-question-input');
        const opt1Input = document.getElementById('qa-option-1');
        const opt2Input = document.getElementById('qa-option-2');
        const opt3Input = document.getElementById('qa-option-3');

        const question = questionInput ? questionInput.value.trim() : '';
        const opt1 = opt1Input ? opt1Input.value.trim() : '';
        const opt2 = opt2Input ? opt2Input.value.trim() : '';
        const opt3 = opt3Input ? opt3Input.value.trim() : '';

        if (!question) {
            if (typeof showNotification === 'function') {
                showNotification('请输入问答的问题内容', 'warning');
            }
            if (questionInput) questionInput.focus();
            return;
        }

        if (!opt1 || !opt2 || !opt3) {
            if (typeof showNotification === 'function') {
                showNotification('请完整填写全部 3 个选项', 'warning');
            }
            return;
        }

        // 关闭弹窗
        window.closeQaModal();

        const messageId = Date.now();
        const qaMsg = {
            id: messageId,
            sender: 'user',
            text: '[问答] ' + question,
            timestamp: new Date(),
            status: 'sent',
            favorited: false,
            type: 'qa',
            qa: {
                question: question,
                options: [opt1, opt2, opt3],
                selectedOption: null
            }
        };

        // 添加并发送消息
        if (typeof addMessage === 'function') {
            addMessage(qaMsg);
        } else if (typeof window.addMessage === 'function') {
            window.addMessage(qaMsg);
        }

        if (typeof playSound === 'function') {
            playSound('send');
        }

        // 调度独立的回复机制（防止定时器冲突与覆盖）
        scheduleIndependentQaReply(messageId, qaMsg.qa);
    };

    /**
     * 初始化事件监听
     */
    function initQa() {
        const qaBtn = document.getElementById('qa-btn');
        if (qaBtn) {
            qaBtn.addEventListener('click', function(e) {
                e.preventDefault();
                window.openQaModal();
            });
        }

        const qaBtnExtra = document.getElementById('qa-btn-extra');
        if (qaBtnExtra) {
            qaBtnExtra.addEventListener('click', function(e) {
                e.preventDefault();
                const extrasPanel = document.getElementById('collapsed-extras-panel');
                const expandBtn = document.getElementById('collapse-expand-btn');
                if (extrasPanel) extrasPanel.style.display = 'none';
                if (expandBtn) expandBtn.classList.remove('open');
                window.openQaModal();
            });
        }

        const cancelBtn = document.getElementById('cancel-qa');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function(e) {
                e.preventDefault();
                window.closeQaModal();
            });
        }

        const sendBtn = document.getElementById('send-qa');
        if (sendBtn) {
            sendBtn.addEventListener('click', function(e) {
                e.preventDefault();
                window.submitQaQuestion();
            });
        }

        // 键盘快捷键支持：Ctrl+Enter 或 Cmd+Enter 直接发送问答
        const modal = document.getElementById('qa-modal');
        if (modal) {
            modal.addEventListener('keydown', function(e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    window.submitQaQuestion();
                } else if (e.key === 'Escape') {
                    window.closeQaModal();
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initQa);
    } else {
        initQa();
    }
})();

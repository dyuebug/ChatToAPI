// DOM Elements
let $chatBox;
let $userInput;
let $sendBtn;
let $currentAssistantBadge;

// Buttons
let $newChatBtn;
let $newAssistantBtn;
let $attachmentBtn;
let $fileUpload;

// Lists
let $assistantsListDiv;
let $historyListDiv;

// Sidebars
let $btnToggleLeft;
let $btnToggleRight;
let $historyPanel;
let $assistantsPanel;
let $leftSidebar;
let $mobileHistoryBtn;
let $mobileAssistantsBtn;


// State
let state = {
    conversationHistory: [], // Full flat list from DB
    messageTree: {}, // Node map
    activeBranch: [], // Current linear history
    activeMessageId: null, // Leaf node of active branch
    selectedSiblings: {}, // parentMessageId -> selected child messageId
    isWaitingForResponse: false,
    assistants: [],
    conversations: [],
    defaultPrompts: [],
    currentAssistantId: null,
    currentConversationId: null,
    urlModelForced: false,
    attachedFiles: []
};

// --- Utility Functions ---
const formatDateTime = (timestamp) => {
    const d = timestamp ? new Date(timestamp) : new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const formatContent = (text) => {
    if (!text) return '';
    
    // Configure marked if available and not configured
    if (window.marked && !window.marked.isConfigured) {
        const renderer = new window.marked.Renderer();
        renderer.code = function(codeInfo, langStr, isEscaped) {
            let text = '';
            let lang = '';
            if (typeof codeInfo === 'object' && codeInfo !== null) {
                text = codeInfo.text || '';
                lang = codeInfo.lang || '';
            } else {
                text = codeInfo || '';
                lang = langStr || '';
            }
            if (window.hljs) {
                try {
                    const validLang = hljs.getLanguage(lang) ? lang : 'plaintext';
                    const highlighted = hljs.highlight(text, { language: validLang }).value;
                    return `<pre><code class="hljs language-${validLang}">${highlighted}</code></pre>`;
                } catch (e) {}
            }
            // fallback
            const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<pre><code>${escapedText}</code></pre>`;
        };
        
        window.marked.use({ renderer, breaks: true, gfm: true });
        
        if (window.markedKatex) {
            window.marked.use(window.markedKatex({
                throwOnError: false,
                output: 'html',
                nonStandard: true // 支持非标准的公式写法（前后无空格）
            }));
        }
        
        window.marked.isConfigured = true;
    }
    
    // First, preprocess <think> tags if they are mixed in the content
    let processedText = text;
    let thinkStartCount = (processedText.match(/<think>/g) || []).length;
    let thinkEndCount = (processedText.match(/<\/think>/g) || []).length;
    
    processedText = processedText.replace(/<think>/g, '<div class="reasoning-container"><div class="reasoning-header"><span class="reasoning-title">思考过程</span><svg class="reasoning-toggle-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg></div><div class="reasoning-content">');
    processedText = processedText.replace(/<\/think>/g, '</div></div>');
    
    for (let i = 0; i < thinkStartCount - thinkEndCount; i++) {
        processedText += '</div></div>';
    }
    
    if (window.marked) {
        return marked.parse(processedText);
    }

    // Fallback if marked is not loaded
    let escaped = processedText.replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;');
    return escaped;
};

const showCustomConfirm = (title, content, onConfirm) => {
    const tplHtml = $('#confirmTpl').html();
    layui.laytpl(tplHtml).render({title: title, content: content}, function(html){
        $('#customConfirmModal').remove();
        $('body').append(html);
        const $modal = $('#customConfirmModal');
        
        $modal.find('.btn-cancel-confirm').on('click', (e) => {
            e.stopPropagation();
            $modal.removeClass('active');
            setTimeout(() => $modal.remove(), 300);
        });
        
        $modal.find('#btn-ok-confirm').on('click', () => {
            onConfirm();
            $modal.removeClass('active');
            setTimeout(() => $modal.remove(), 300);
        });
    });
};

// 独立的打字机渲染器，基于 jQuery 封装，用于处理流式渲染的平滑打字效果
const createStreamRenderer = ($bubble, formatFn, onComplete) => {
    let queue = [];
    let isProcessing = false;
    let contentStr = '';
    let reasoningStr = '';
    let timer = null;
    let networkFinished = false;

    const processQueue = () => {
        if (queue.length === 0) {
            isProcessing = false;
            if (networkFinished && onComplete) {
                onComplete();
            }
            return;
        }

        // 动态计算每次处理的字符数，队列越长处理越快，避免堆积卡顿
        const itemsToProcess = Math.max(1, Math.floor(queue.length / 15));
        let hasContent = false;
        let hasReasoning = false;

        for (let i = 0; i < itemsToProcess; i++) {
            const item = queue.shift();
            if (!item) break;

            if (item.type === 'content') {
                contentStr += item.char;
                hasContent = true;
            } else if (item.type === 'reasoning') {
                reasoningStr += item.char;
                hasReasoning = true;
            }
        }

        if (hasReasoning) {
            let $reasoningContainer = $bubble.find('.reasoning-container');
            if ($reasoningContainer.length === 0) {
                const reasoningHtml = `
                    <div class="reasoning-container">
                        <div class="reasoning-header">
                            <span class="reasoning-title">思考过程</span>
                            <svg class="reasoning-toggle-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                        </div>
                        <div class="reasoning-content"></div>
                    </div>`;
                
                const $contentText = $bubble.find('.content-text');
                if ($contentText.length > 0) {
                    $reasoningContainer = $(reasoningHtml).insertBefore($contentText);
                } else {
                    $reasoningContainer = $(reasoningHtml).appendTo($bubble);
                }
            }
            $reasoningContainer.find('.reasoning-content').text(reasoningStr);
        }

        if (hasContent) {
            let $contentText = $bubble.find('.content-text');
            if ($contentText.length > 0) {
                $contentText.html(formatFn(contentStr));
            } else {
                $bubble.html(formatFn(contentStr));
            }
        }

        if ($chatBox.length > 0) {
            $chatBox.scrollTop($chatBox[0].scrollHeight);
        }

        let delay = queue.length > 100 ? 5 : 20;
        timer = setTimeout(processQueue, delay);
    };

    return {
        push: (type, text) => {
            if (!text) return;
            for (let i = 0; i < text.length; i++) {
                queue.push({ type, char: text[i] });
            }
            if (!isProcessing) {
                isProcessing = true;
                processQueue();
            }
        },
        setNetworkFinished: () => {
            networkFinished = true;
            if (!isProcessing && queue.length === 0 && onComplete) {
                onComplete();
            }
        },
        destroy: () => {
            if (timer) clearTimeout(timer);
            queue = [];
        }
    };
};

// --- Data Persistence (LocalStorage) ---
const loadData = async () => {
    await loadModels();

    try {
        const assistantsRes = await fetchGet('/API/Web/Assistant/GetList');
        if (assistantsRes && assistantsRes.code === 200) {
            state.assistants = assistantsRes.data || [];
        }
        
        const convRes = await fetchGet('/API/Web/Conversation/GetList');
        if (convRes && convRes.code === 200) {
            state.conversations = convRes.data || [];
        }
        
        const promptRes = await fetchGet('/API/Web/PresetPrompt/GetList');
        if (promptRes && promptRes.code === 200) {
            state.defaultPrompts = promptRes.data || [];
        }
    } catch (e) {
        console.error('API load error', e);
    }

    if (state.assistants.length === 0) {
        // Create a default assistant if none exist
        const defaultAssistant = {
            assistantId: '',
            name: '默认助手',
            maxHistory: 99,
            prefillEnabled: false,
            systemPrompt: ''
        };
        const addRes = await fetchPost('/API/Web/Assistant/Add', defaultAssistant);
        if (addRes && addRes.code === 200 && addRes.data && addRes.data.assistantId) {
            defaultAssistant.assistantId = addRes.data.assistantId;
        }
        state.assistants.push(defaultAssistant);
        state.currentAssistantId = defaultAssistant.assistantId;
    }

    if (!state.currentAssistantId || !state.assistants.find(a => a.assistantId === state.currentAssistantId)) {
        state.currentAssistantId = state.assistants[0]?.assistantId || null;
    }

    if (!state.currentConversationId || !state.conversations.find(c => c.conversationId === state.currentConversationId)) {
        if (state.conversations.length === 0) {
            try {
                const addRes = await fetchPost('/API/Web/Conversation/Add', {
                    assistantId: state.currentAssistantId,
                    title: "新对话"
                });
                if (addRes && addRes.code === 200 && addRes.data) {
                    await reloadHistoryList();
                    // 初始化创建的置空
                    const initConv = state.conversations.find(c => c.conversationId === addRes.data.conversationId);
                    if (initConv) {
                        initConv.messageCount = 0;
                    }
                    switchConversation(addRes.data.conversationId);
                } else {
                    createNewConversation();
                }
            } catch (e) {
                createNewConversation();
            }
        } else {
            switchConversation(state.conversations[0].conversationId);
        }
    } else {
        switchConversation(state.currentConversationId);
    }
};

// --- UI Rendering ---
const updateCurrentAssistantBadge = () => {
    if (state.currentAssistantId) {
        const assistant = state.assistants.find(a => a.assistantId === state.currentAssistantId);
        if (assistant) {
            $currentAssistantBadge.text(`${assistant.name}`);
            $('#current-assistant-name').text(`${assistant.name}`);
            
            // Populate and set top model select (Custom Dropdown)
            const $customModelList = $('#model-dropdown-list');
            const $providerList = $('#provider-list');
            const $selectedModelName = $('.selected-model-name');
            
            $customModelList.empty();
            // Keep provider title
            $providerList.find('.provider-item').remove();
            
            if (typeof MODEL_LIST !== 'undefined' && MODEL_LIST.length > 0) {
                if (!state.currentModel) state.currentModel = MODEL_LIST[0].modelName;
                
                // Extract unique providers
                const providers = [...new Set(MODEL_LIST.map(m => m.provider || 'Other'))];
                let activeProvider = MODEL_LIST.find(m => m.modelName === state.currentModel)?.provider || providers[0] || 'Other';
                
                // Render providers
                providers.forEach(provider => {
                    const isActive = provider === activeProvider;
                    $providerList.append(`
                        <div class="provider-item ${isActive ? 'active' : ''}" data-provider="${provider}">
                            <span>${provider}</span>
                            <svg class="check-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                        </div>
                    `);
                });
                
                // Helper to render models by provider
                const renderModelsForProvider = (provider) => {
                    $customModelList.empty();
                    const filteredModels = MODEL_LIST.filter(m => (m.provider || 'Other') === provider);
                    
                    filteredModels.forEach(item => {
                        const isSelected = state.currentModel === item.modelName;
                        
                        if (isSelected) {
                            $selectedModelName.text(item.modelName);
                        }
                        
                        let displayName = item.modelName;
                    
                    $customModelList.append(`
                            <div class="dropdown-item ${isSelected ? 'active' : ''}" data-value="${item.modelName}" style="padding: 10px 12px; font-size: 14px; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; ${isSelected ? 'background: var(--chat-hover);' : ''}">
                                <div class="dropdown-item-content">
                                    <span class="dropdown-item-title" style="color: ${isSelected ? 'var(--brand, #ff512b)' : 'var(--text-main)'}; font-weight: ${isSelected ? '500' : '400'};">${displayName}</span>
                                </div>
                                ${isSelected ? '<svg class="check-icon" viewBox="0 0 24 24" width="14" height="14" fill="var(--brand, #ff512b)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
                            </div>
                        `);
                });
                };
                
                // Initial render for active provider
                renderModelsForProvider(activeProvider);
                
                // Provider click event (delegate to parent so we don't bind multiple times)
                $providerList.off('click', '.provider-item').on('click', '.provider-item', function(e) {
                    e.stopPropagation();
                    const selectedProvider = $(this).data('provider');
                    
                    // Update active state
                    $providerList.find('.provider-item').removeClass('active');
                    $(this).addClass('active');
                    
                    // Render new models
                    renderModelsForProvider(selectedProvider);
                    
                    // Clear search
                    $modelDropdownMenu.find('.search-bar input').val('');
                });
                
            } else {
                $selectedModelName.text(state.currentModel);
                $customModelList.append(`
                    <div class="dropdown-item active" data-value="${state.currentModel}" style="padding: 8px 12px; font-size: 13px; border-radius: 6px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: var(--chat-hover);">
                        <div class="dropdown-item-content">
                            <span class="dropdown-item-title" style="color: var(--primary); font-weight: 500;">${state.currentModel}</span>
                        </div>
                        <svg class="check-icon" viewBox="0 0 24 24" width="14" height="14" fill="var(--primary)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    </div>
                `);
            }
            
        } else {
             $currentAssistantBadge.text("请选择助手");
             $('#current-assistant-name').text("请选择助手");
        }
    }
};

const renderAssistantsList = () => {
    $assistantsListDiv.empty();
    if (state.assistants.length === 0) {
        $assistantsListDiv.html('<div class="text-center text-secondary py-5" style="font-size:13px;">没有已保存的助手。</div>');
        return;
    }
    state.assistants.forEach(assistant => {
        const $btn = $('<div>')
            .addClass(`assistant-item ${assistant.assistantId === state.currentAssistantId ? 'active' : ''}`)
            .html(`
                <span class="assistant-dot"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"></path><rect x="4" y="12" width="16" height="8" rx="2"></rect><path d="M15 13v2"></path><path d="M9 13v2"></path></svg></span>
                <span class="assistant-name" style="flex:1;text-align:left;">${assistant.name}</span>
                <div class="list-item-actions">
                    <button data-id="${assistant.assistantId}" class="edit-assistant-btn" title="编辑"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 10.19l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
                    <button data-id="${assistant.assistantId}" class="delete-assistant-btn" title="删除"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
                </div>
            `);
        $btn.on('click', (e) => {
            if ($(e.target).closest('.list-item-actions').length === 0) {
                selectAssistant(assistant.assistantId);
            }
        });
        // Allow hover to show actions (will be handled by css)
        $assistantsListDiv.append($btn);
    });
};

const renderHistoryList = () => {
    $historyListDiv.empty();
    if (state.conversations.length === 0) {
        $historyListDiv.html('<div class="text-center text-secondary py-5" style="font-size:13px;">暂无聊天历史</div>');
        return;
    }

    state.conversations.sort((a, b) => new Date(b.updateTime || b.timestamp) - new Date(a.updateTime || a.timestamp)).forEach(conv => {
        const updateTime = new Date(conv.updateTime || conv.timestamp || Date.now());
        const today = new Date();
        const isToday = updateTime.getDate() === today.getDate() && updateTime.getMonth() === today.getMonth() && updateTime.getFullYear() === today.getFullYear();
        const timeStr = isToday ? `${String(updateTime.getHours()).padStart(2, '0')}:${String(updateTime.getMinutes()).padStart(2, '0')}` : `${updateTime.getMonth() + 1}月${updateTime.getDate()}日`;
        
        const assistant = state.assistants.find(a => a.assistantId === conv.assistantId);
        const assistantName = assistant ? assistant.name : '未知助手';
        const modelName = conv.modelName || (assistant && assistant.model) || state.currentModel || '未知模型';
        
        const $btn = $('<div>')
            .addClass(`history-item ${conv.conversationId === state.currentConversationId ? 'active' : ''}`)
            .html(`
                <span class="history-row"><span class="history-title">${conv.title}</span><span class="history-time">${timeStr}</span></span>
                <span class="history-preview" style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                    <span style="flex: 1; overflow: hidden; text-overflow: ellipsis;">${assistantName} · ${modelName}</span>
                    <div class="list-item-actions">
                        <button data-id="${conv.conversationId}" class="edit-conv-btn" title="编辑名称"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 10.19l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
                        <button data-id="${conv.conversationId}" class="delete-conv-btn" title="删除"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
                    </div>
                </span>
            `);
        $btn.on('click', (e) => {
            if ($(e.target).closest('.list-item-actions').length === 0) {
                state.urlModelForced = false;
                switchConversation(conv.conversationId);
            }
        });
        $historyListDiv.append($btn);
    });
};

const reloadHistoryList = async () => {
    try {
        const convRes = await fetchGet('/API/Web/Conversation/GetList');
        if (convRes && convRes.code === 200) {
            state.conversations = convRes.data || [];
            
            // 如果当前正在对话中，且列表刷新了，需要同步最新正在进行的对话 messageCount
            if (state.currentConversationId) {
                const currentConv = state.conversations.find(c => c.conversationId === state.currentConversationId);
                if (currentConv && state.conversationHistory) {
                    currentConv.messageCount = state.conversationHistory.length;
                }
            }
            
            renderHistoryList();
        }
    } catch (e) {
        console.error('Failed to reload history list', e);
    }
};

const buildConversationTree = () => {
    state.messageTree = {};
    const rootNodes = [];
    state.conversationHistory.forEach(msg => {
        state.messageTree[msg.messageId] = { ...msg, children: [] };
    });
    
    state.conversationHistory.forEach(msg => {
        const node = state.messageTree[msg.messageId];
        // Ensure we properly handle null, undefined, or empty string as root nodes
        if (msg.parentMessageId && msg.parentMessageId.trim() !== '' && state.messageTree[msg.parentMessageId]) {
            // Prevent pushing self to children to avoid cycle
            if (msg.parentMessageId !== msg.messageId) {
                state.messageTree[msg.parentMessageId].children.push(node);
            }
        } else {
            rootNodes.push(node);
        }
    });
    
    // Find active leaf (state.activeMessageId)
    // If not set or not found, find the most recently created leaf node (usually the last in flat array)
    if (!state.activeMessageId || !state.messageTree[state.activeMessageId]) {
        if (state.conversationHistory.length > 0) {
            state.activeMessageId = state.conversationHistory[state.conversationHistory.length - 1].messageId;
        } else {
            state.activeMessageId = null;
        }
    }
    
    // Compute active branch
    state.activeBranch = [];
    let currentId = state.activeMessageId;
    let cycleGuard = new Set();
    while (currentId && state.messageTree[currentId]) {
        if (cycleGuard.has(currentId)) {
            console.warn('Cycle detected in message tree at node:', currentId);
            break;
        }
        cycleGuard.add(currentId);
        state.activeBranch.push(state.messageTree[currentId]);
        
        // Prevent traversing back to self if parent is same as self
        if (state.messageTree[currentId].parentMessageId === currentId) {
            break;
        }
        currentId = state.messageTree[currentId].parentMessageId;
    }
    state.activeBranch.reverse();
};

const renderChat = () => {
    $chatBox.empty();
    buildConversationTree();
    
    if (state.activeBranch.length === 0) {
        $('#empty-state').css('display', 'flex');
        $chatBox.css('display', 'none');
    } else {
        $('#empty-state').css('display', 'none');
        $chatBox.css('display', 'flex');
        
        state.activeBranch.forEach(msg => {
            let msgToRender = msg;
            // Check if there's a selected sibling for this slot
            const parentId = msg.parentMessageId;
            if (state.selectedSiblings[parentId]) {
                const selectedSiblingId = state.selectedSiblings[parentId];
                const sibling = state.conversationHistory.find(m => m.messageId === selectedSiblingId);
                if (sibling) {
                    msgToRender = sibling;
                }
            }
            const isStreaming = state.isWaitingForResponse && msgToRender.content === '' && msgToRender.role === 'assistant';
            displayMessage(msgToRender, isStreaming);
        });
    }
};

// --- UI Helpers for Prompts Modal ---
const renderPromptsList = ($list) => {
    $list.empty();
    if (state.defaultPrompts.length === 0) {
        $list.html('<div class="prompt-list-empty">暂无系统默认填充，请添加</div>');
        return;
    }

    state.defaultPrompts.forEach((prompt, index) => {
        const $item = $(`
            <div class="prompt-item prompt-item-container">
                <div class="prompt-item-header">
                    <div class="prompt-item-title">${prompt.name}</div>
                    <div>
                        <button type="button" class="btn-select-prompt prompt-item-action select" data-index="${index}">选择</button>
                        <button type="button" class="btn-edit-prompt prompt-item-action edit" data-index="${index}">编辑</button>
                        <button type="button" class="btn-delete-prompt prompt-item-action delete" data-index="${index}">删除</button>
                    </div>
                </div>
                <div class="prompt-item-desc">${prompt.content}</div>
            </div>
        `);
        $list.append($item);
    });
};

const openPromptFormModal = (promptData, isEdit, index, onSuccess) => {
    const tplHtml = $('#promptFormTpl').html();
    layui.laytpl(tplHtml).render(isEdit ? { ...promptData, index } : {}, function(html) {
        $('#promptFormModal').remove();
        $('body').append(html);
        const $promptModal = $('#promptFormModal');

        $promptModal.find('.btn-cancel-prompt').on('click', (e) => {
            e.stopPropagation();
            $promptModal.removeClass('active');
            setTimeout(() => $promptModal.remove(), 300);
        });

        $promptModal.find('#save-prompt-btn').on('click', async () => {
            const name = $('#prompt-form-name').val().trim();
            const content = $('#prompt-form-content').val().trim();
            if (!name || !content) {
                layer.msg('名称和内容不能为空');
                return;
            }
            
            if (isEdit) {
                const prompt = state.defaultPrompts[index];
                prompt.name = name;
                prompt.content = content;
                await fetchPost('/API/Web/PresetPrompt/Edit', { promptId: prompt.promptId, name, content });
            } else {
                const addRes = await fetchPost('/API/Web/PresetPrompt/Add', { promptId: '', name, content });
                let newId = '';
                if (addRes && addRes.code === 200 && addRes.data && addRes.data.promptId) {
                    newId = addRes.data.promptId;
                }
                state.defaultPrompts.push({ promptId: newId, name, content });
            }
            
            onSuccess();
            
            $promptModal.removeClass('active');
            setTimeout(() => $promptModal.remove(), 300);
        });
    });
};

// --- Actions ---
const openAssistantForm = (assistant) => {
    const defaultData = { name: '默认助手', model: MODEL_LIST[0]?.modelName || 'grok-4', maxHistory: 99, prefillEnabled: true };
    const data = assistant || defaultData;
    const tplHtml = $('#assistantFormTpl').html();
    layui.laytpl(tplHtml).render(data, function(html){
        // Remove existing modal if any
        $('#assistantModal').remove();
        $('body').append(html);
        const $modal = $('#assistantModal');

        $modal.find('.btn-cancel-assistant').on('click', (e) => {
            e.stopPropagation();
            $modal.removeClass('active');
            setTimeout(() => $modal.remove(), 300);
        });

        // Handle switch toggle
        $modal.find('#prefill-toggle').on('change', function() {
            if ($(this).is(':checked')) {
                $('#system-prompt-container').show();
            } else {
                $('#system-prompt-container').hide();
            }
        });

        // Render default prompts
        const $list = $('#default-prompts-list');
        renderPromptsList($list);

        // Handle select prompt
        $list.on('click', '.btn-select-prompt', function() {
            const index = $(this).data('index');
            $('#system-prompt').val(state.defaultPrompts[index].content);
            layer.msg('已填充: ' + state.defaultPrompts[index].name);
        });

        // Handle edit prompt
        $list.on('click', '.btn-edit-prompt', function() {
            const index = $(this).data('index');
            const prompt = state.defaultPrompts[index];
            openPromptFormModal(prompt, true, index, () => renderPromptsList($list));
        });

        // Handle delete prompt
        $list.on('click', '.btn-delete-prompt', function() {
            const index = $(this).data('index');
            const promptId = state.defaultPrompts[index].promptId;
            showCustomConfirm('删除确认', '确定要删除这个默认填充吗？', async function() {
                state.defaultPrompts.splice(index, 1);
                await fetchPost(`/API/Web/PresetPrompt/Remove?promptId=${promptId}`);
                renderPromptsList($list);
            });
        });

        // Handle add prompt
        $modal.find('#add-default-prompt-btn').on('click', function() {
            openPromptFormModal(null, false, null, () => renderPromptsList($list));
        });

        $modal.find('#save-assistant-btn').on('click', async (e) => {
            e.preventDefault();
            
            const assistantId = $modal.find('#assistant-id').val() || '';
            const existingAssistant = state.assistants.find(a => a.assistantId === assistantId);

            const nameVal = $modal.find('#assistant-name').val().trim();
            if (!nameVal) {
                layer.msg('请输入助手名称', {icon: 5});
                return;
            }

            const assistantData = {
                assistantId,
                name: nameVal,
                model: existingAssistant ? existingAssistant.model : (typeof MODEL_LIST !== 'undefined' && MODEL_LIST[0] ? MODEL_LIST[0].modelName : 'grok-4'),
                maxHistory: parseInt($modal.find('#max-history').val()) || 10,
                prefillEnabled: $modal.find('#prefill-toggle').prop('checked'),
                systemPrompt: $modal.find('#system-prompt').val().trim()
            };

            if (existingAssistant) {
                Object.assign(existingAssistant, assistantData);
                await fetchPost('/API/Web/Assistant/Edit', assistantData);
            } else {
                const addRes = await fetchPost('/API/Web/Assistant/Add', assistantData);
                if (addRes && addRes.code === 200 && addRes.data && addRes.data.assistantId) {
                    assistantData.assistantId = addRes.data.assistantId;
                }
                state.assistants.push(assistantData);
            }

            if (!state.currentAssistantId) {
                state.currentAssistantId = assistantData.assistantId;
            }

            renderAssistantsList();
            selectAssistant(assistantData.assistantId);
            $modal.removeClass('active');
            setTimeout(() => $modal.remove(), 300);
            layer.msg('助手已保存', {icon: 1});
        });
    });
};

const hideLeftSidebar = () => {
    const $sidebarOverlay = $('#sidebar-overlay');
    if ($leftSidebar && $leftSidebar.hasClass('open')) {
        $leftSidebar.removeClass('open');
        $sidebarOverlay.removeClass('active');
    }
};

const selectAssistant = async (id) => {
    state.currentAssistantId = id;
    const assistant = state.assistants.find(a => a.assistantId === id);
    if (assistant) {
        updateCurrentAssistantBadge();
        renderAssistantsList();
        
        // Auto close mobile left sidebar on selection
        hideLeftSidebar();

        // 切换助手时给当前对话变更对应助手Id
        if (state.currentConversationId) {
            const conversation = state.conversations.find(c => c.conversationId === state.currentConversationId);
            if (conversation && conversation.assistantId !== id) {
                let loadIndex = null;
                if (typeof layer !== 'undefined') {
                    loadIndex = layer.load(2, { shade: [0.4, '#000'] });
                }
                conversation.assistantId = id;
                try {
                    await fetchPost('/API/Web/Conversation/EditAssistant', {
                        conversationId: state.currentConversationId,
                        assistantId: id
                    });
                } catch (e) {
                    console.error('Failed to update conversation assistant', e);
                } finally {
                    if (loadIndex !== null && typeof layer !== 'undefined') {
                        layer.close(loadIndex);
                    }
                }
            }
        }
    }
};

const createNewConversation = async () => {
    // 检查是否存在没有任何对话内容的对话
    const emptyConversation = state.conversations.find(c => c.messageCount === 0);
    if (emptyConversation) {
        // 如果存在空对话，则选中该对话
        await switchConversation(emptyConversation.conversationId);
        hideLeftSidebar();
        return emptyConversation;
    }

    let currentAssistant = getCurrentAssistantOrDefault();
    let loadIndex = null;
    if (typeof layer !== 'undefined') {
        loadIndex = layer.load(2, { shade: [0.4, '#000'] });
    }
    try {
        const addRes = await fetchPost('/API/Web/Conversation/Add', {
            assistantId: currentAssistant.assistantId,
            title: "新对话"
        });
        if (addRes && addRes.code === 200 && addRes.data) {
            state.currentConversationId = addRes.data.conversationId;
            state.activeMessageId = null;
            state.conversationHistory = [];
            state.urlModelForced = false;
            updateCurrentAssistantBadge();
            renderChat();
            await reloadHistoryList();
            
            // 手动将新创建的对话的 messageCount 置为 0，防止由于接口可能没返回而导致 undefined
            const newConv = state.conversations.find(c => c.conversationId === state.currentConversationId);
            if (newConv) {
                newConv.messageCount = 0;
            }
            
            // 手动刷新一次列表视图
            renderHistoryList();
            
            $userInput.val('').css('height', 'auto').focus();
            hideLeftSidebar();
            return addRes.data;
        } else if (addRes && (addRes.error || addRes.msg)) {
            if (typeof layer !== 'undefined') {
                layer.msg(addRes.error?.message || addRes.msg || '创建对话失败');
            }
        }
    } catch (e) {
        console.error('Failed to create new conversation', e);
    } finally {
        if (loadIndex !== null && typeof layer !== 'undefined') {
            layer.close(loadIndex);
        }
    }
    return null;
};

const switchConversation = async (id) => {
    state.currentConversationId = id;
    state.activeMessageId = null; // Reset on switch
    state.selectedSiblings = {}; // Reset sibling selections
    const conversation = state.conversations.find(c => c.conversationId === id);

    if (conversation) {
        state.conversationHistory = [];
        renderChat(); // clear chat box initially
        
        let loadIndex = null;
        if (typeof layer !== 'undefined') {
            loadIndex = layer.load(2, { shade: [0.4, '#000'] });
        }

        try {
            const response = await fetch(getFullUrl(`/API/Web/ConversationMessage/GetList?conversationId=${id}`));
            if (!response.ok) {
                state.conversationHistory = conversation.messages || [];
                renderChat();
            } else {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const resJson = await response.json();
                    if (resJson.code === 200) {
                        state.conversationHistory = resJson.data || [];
                    } else {
                        if (typeof layer !== 'undefined') {
                            layer.msg(resJson.error?.message || resJson.msg || '获取对话记录失败');
                        }
                        state.conversationHistory = conversation.messages || [];
                    }
                    renderChat();
                } else {
                    // event-stream
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n\n');
                        buffer = lines.pop();

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const dataStr = line.substring(6);
                                if (dataStr === '[DONE]') continue;
                                try {
                                    const msg = JSON.parse(dataStr);
                                    state.conversationHistory.push(msg);
                                } catch (e) {}
                            }
                        }
                    }
                    renderChat();
                }
                
                if (state.conversationHistory.length > 0) {
                    for (let i = state.conversationHistory.length - 1; i >= 0; i--) {
                        if (state.conversationHistory[i].modelName) {
                            if (!state.urlModelForced) {
                                state.currentModel = state.conversationHistory[i].modelName;
                            }
                            break;
                        }
                    }
                }
                
                // 同步当前对话的 messageCount
                conversation.messageCount = state.conversationHistory.length;
            }
        } catch (e) {
            state.conversationHistory = conversation.messages || [];
            conversation.messageCount = state.conversationHistory.length;
            renderChat();
        } finally {
            if (loadIndex !== null && typeof layer !== 'undefined') {
                layer.close(loadIndex);
            }
        }
        
        if (conversation.assistantId && conversation.assistantId !== state.currentAssistantId) {
            selectAssistant(conversation.assistantId);
        } else {
            updateCurrentAssistantBadge();
        }
    } else {
        state.conversationHistory = [];
        renderChat();
    }

    // 每次切换时都更新一次UI以防状态没同步
    renderHistoryList();
    
    // Auto close mobile left sidebar on selection
    hideLeftSidebar();
    
    $userInput.focus();
};

const switchBranch = (msgId, parentId) => {
    state.selectedSiblings[parentId] = msgId;
    renderChat();
};

const appendBranchSwitcher = (msg, $actionsDiv) => {
    const parentId = msg.parentMessageId;
    let siblings = [];
    if (parentId && parentId.trim() !== '' && state.messageTree[parentId]) {
        siblings = state.messageTree[parentId].children;
    } else if (!parentId || parentId.trim() === '') {
        siblings = state.conversationHistory.filter(m => !m.parentMessageId || m.parentMessageId.trim() === '');
    }
    
    if (siblings.length > 1) {
        const currentIndex = siblings.findIndex(m => m.messageId === msg.messageId);
        if (currentIndex !== -1) {
            const $switcher = $('<div>').addClass('branch-switcher');
            const $prevBtn = $('<button>').html('<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>').on('click', () => switchBranch(siblings[currentIndex - 1].messageId, parentId));
            if (currentIndex === 0) $prevBtn.prop('disabled', true);
            
            const $nextBtn = $('<button>').html('<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>').on('click', () => switchBranch(siblings[currentIndex + 1].messageId, parentId));
            if (currentIndex === siblings.length - 1) $nextBtn.prop('disabled', true);
            
            const $text = $('<span>').text(`${currentIndex + 1} / ${siblings.length}`);
            $switcher.append($prevBtn, $text, $nextBtn);
            $actionsDiv.append($switcher);
        }
    }
};

// --- Message Management ---
const displayMessage = (msg, isStreaming = false) => {
    if ($chatBox.css('display') === 'none') {
        $('#empty-state').css('display', 'none');
        $chatBox.css('display', 'flex');
    }

    const { content, role, modelName, reasoningContent, messageId } = msg;
    const msgTimestamp = msg.createTime || msg.timestamp;
    
    const $messageDiv = $('<div>').addClass(`message ${role}`);
    if (messageId) {
        $messageDiv.attr('data-message-id', messageId);
    }
    
    let timestampStr = msgTimestamp ? formatDateTime(msgTimestamp) : formatDateTime();

    if (role === 'assistant') {
        const $messageInfo = $('<div>').addClass('message-info')
            .append($('<span>').css({fontWeight: '600', color: 'var(--text-main)'}).text(modelName || 'AI Assistant'))
            .append($('<span>').css({fontSize: '12px', color: 'var(--text-tertiary)'}).text(timestampStr));
        
        $messageDiv.append($messageInfo);

        const $bubbleDiv = $('<div>').addClass('bubble');
        
        if (reasoningContent) {
            const $reasoningContainer = $('<div>').addClass('reasoning-container')
                .append($('<div>').addClass('reasoning-header').html('<span class="reasoning-title">思考过程</span><svg class="reasoning-toggle-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>'))
                .append($('<div>').addClass('reasoning-content').text(reasoningContent));
            
            $bubbleDiv.append($reasoningContainer);
        }

        const $contentDiv = $('<div>').addClass('content-text').html(formatContent(content));
        $bubbleDiv.append($contentDiv);

        $messageDiv.append($bubbleDiv);
        
        // Actions
        const $actionsDiv = $('<div>').addClass('message-actions-bottom');
        const $copyBtn = $('<button>').addClass('icon-btn-sm').attr('title', '复制')
            .html('<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>')
            .on('click', () => { navigator.clipboard.writeText(msg.content || content); layer.msg('已复制'); });
            
        const $regenBtn = $('<button>').addClass('icon-btn-sm').attr('title', '重新生成')
            .html('<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>')
            .on('click', () => sendMessageToAI('', true, msg.messageId));
            
        $actionsDiv.append($copyBtn, $regenBtn);
        
        appendBranchSwitcher(msg, $actionsDiv);
        
        if (isStreaming) {
            $actionsDiv.hide();
        }
        $messageDiv.append($actionsDiv);

    } else {
        const $messageInfo = $('<div>').addClass('message-info')
            .append($('<span>').css({fontWeight: '600', color: 'var(--text-main)'}).text('我'))
            .append($('<span>').css({fontSize: '12px', color: 'var(--text-tertiary)'}).text(timestampStr));
        
        $messageDiv.append($messageInfo);

        const $bubbleDiv = $('<div>').addClass('bubble');
        
        // Handle attachments parsing
        let displayContent = content;
        const attachmentRegex = /(图片|附件):\[(.*?)\]\((.*?)\)/g;
        let attachmentsHtml = '';
        let match;
        
        while ((match = attachmentRegex.exec(content)) !== null) {
            const type = match[1];
            const name = match[2];
            const url = match[3];
            
            attachmentsHtml += `
                <div class="file-preview-item" style="display: flex; align-items: center; padding: 6px 12px; background: rgba(240, 242, 245, 0.8); border-radius: 6px; font-size: 13px; border: 1px solid rgba(0,0,0,0.05); flex-shrink: 0;">
                    <a href="${url}" target="_blank" style="color: #1677ff; text-decoration: none; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; vertical-align: middle;">${name}</a>
                </div>
            `;
            
            // Remove the attachment string from the main content
            displayContent = displayContent.replace(match[0], '').trim();
        }
        
        if (attachmentsHtml) {
            const $attachmentsContainer = $('<div>').css({
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                justifyContent: 'flex-start',
                marginBottom: displayContent ? '8px' : '0'
            }).html(attachmentsHtml);
            $bubbleDiv.append($attachmentsContainer);
        }
        
        if (displayContent) {
            $bubbleDiv.append($('<div>').addClass('content-text').text(displayContent));
        }

        $messageDiv.append($bubbleDiv);
        
        // Actions
        const $actionsDiv = $('<div>').addClass('message-actions-bottom');
        const $copyBtn = $('<button>').addClass('icon-btn-sm').attr('title', '复制')
            .html('<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>')
            .on('click', () => { navigator.clipboard.writeText(msg.content || content); layer.msg('已复制'); });
            
        const $editBtn = $('<button>').addClass('icon-btn-sm').attr('title', '编辑')
            .html('<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 10.19l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>')
            .on('click', () => {
                const $editBox = $('<div>').addClass('edit-box-container');
                const $textarea = $('<textarea>').attr('rows', 3).val(msg.content);
                const $actions = $('<div>').addClass('edit-box-actions');
                const $cancelBtn = $('<button>').addClass('btn btn-ghost btn-sm').text('取消').on('click', () => {
                    $editBox.remove();
                    $bubbleDiv.show();
                    $actionsDiv.css('display', 'flex');
                });
                const $sendEditBtn = $('<button>').addClass('btn btn-primary btn-sm').text('发送').on('click', () => {
                    const newText = $textarea.val().trim();
                    if (newText) {
                        $editBox.remove();
                        $bubbleDiv.show();
                        $actionsDiv.css('display', 'flex');
                        sendMessageToAI(newText);
                    }
                });
                $actions.append($cancelBtn, $sendEditBtn);
                $editBox.append($textarea, $actions);
                
                $bubbleDiv.hide();
                $actionsDiv.hide();
                $messageInfo.after($editBox);
            });
            
        $actionsDiv.append($copyBtn, $editBtn);
        
        if (isStreaming) {
            $actionsDiv.hide();
        }
        $messageDiv.append($actionsDiv);
    }

    $chatBox.append($messageDiv);
    if ($chatBox.length > 0) {
        $chatBox.scrollTop($chatBox[0].scrollHeight);
    }

    return $messageDiv[0];
};

const getCurrentAssistantOrDefault = () => {
    let currentAssistant = state.assistants.find(a => a.assistantId === state.currentAssistantId);
    if (!currentAssistant) {
        currentAssistant = {
            maxHistory: 99,
            prefillEnabled: false,
            systemPrompt: ''
        };
    }
    return currentAssistant;
};

const prepareUIForWaiting = () => {
    state.isWaitingForResponse = true;
    $sendBtn.prop('disabled', true).addClass('layui-btn-disabled');
    $userInput.prop('disabled', true);
};

const restoreUIAfterWaiting = (streamRenderer) => {
    state.isWaitingForResponse = false;
    $sendBtn.prop('disabled', false).removeClass('layui-btn-disabled');
    $userInput.prop('disabled', false).focus();
    if (streamRenderer) streamRenderer.setNetworkFinished();
};

const createAssistantMessageUI = (assistant, parentMessageId, isRegenerate = false) => {
    const assistantMessageId = generateUUID();
    const assistantMessage = {
        messageId: assistantMessageId,
        parentMessageId: parentMessageId,
        content: '',
        role: 'assistant',
        assistantId: state.currentAssistantId,
        modelName: state.currentModel,
        timestamp: Date.now(),
        reasoningContent: ''
    };
    state.conversationHistory.push(assistantMessage);
    
    // 如果是正常的（非重新生成），更新 activeMessageId
    // 如果是重新生成，activeMessageId 不变，因为我们只是在 slot 里添加了一个 sibling
    if (!state.activeMessageId || state.conversationHistory.length === 1) {
        state.activeMessageId = assistantMessageId;
    } else if (!isRegenerate) {
        // Find if this new message is being added to the very end of the active branch
        const lastActiveMsg = state.activeBranch[state.activeBranch.length - 1];
        if (lastActiveMsg && lastActiveMsg.messageId === parentMessageId) {
            state.activeMessageId = assistantMessageId;
        }
    }
    
    buildConversationTree();

    // AI消息入栈后再次更新 messageCount
    const currentConv = state.conversations.find(c => c.conversationId === state.currentConversationId);
    if (currentConv) {
        currentConv.messageCount = state.conversationHistory.length;
    }
    
    const assistantMessageElement = displayMessage(assistantMessage, true);
    
    const $assistantBubble = $(assistantMessageElement).find('.bubble');
    let $contentTextDiv = $assistantBubble.find('.content-text');
    if ($contentTextDiv.length === 0) {
        $contentTextDiv = $('<div>').addClass('content-text');
        $assistantBubble.append($contentTextDiv);
    }
    
    // Add loading indicator
    $contentTextDiv.html('<div class="typing-indicator"><span>思考中</span><div class="dots"><span></span><span></span><span></span></div></div>');
    
    const streamRenderer = createStreamRenderer($assistantBubble, formatContent, () => {
        $assistantBubble.closest('.message').find('.btn-copy-top').show();
        $assistantBubble.closest('.message').find('.message-actions-bottom').css('display', 'flex');
    });

    return { assistantMessage, assistantMessageElement, streamRenderer, $assistantBubble, $contentTextDiv };
};

const processChatStream = async (reader, assistantMessage, streamRenderer) => {
    const decoder = new TextDecoder();
    let buffer = '';
    let streamContentBuffer = '';
    let isThinking = false;

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            // Flush any remaining streamContentBuffer
            if (streamContentBuffer.length > 0) {
                if (isThinking) {
                    assistantMessage.reasoningContent += streamContentBuffer;
                    streamRenderer.push('reasoning', streamContentBuffer);
                } else {
                    assistantMessage.content += streamContentBuffer;
                    streamRenderer.push('content', streamContentBuffer);
                }
                streamContentBuffer = '';
            }
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.substring(6);
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta;

                    if (delta) {
                        if (delta.reasoning_content) {
                            assistantMessage.reasoningContent += delta.reasoning_content;
                            streamRenderer.push('reasoning', delta.reasoning_content);
                        }

                        if (delta.content) {
                            streamContentBuffer += delta.content;
                            
                            // Process streamContentBuffer to extract <think> tags
                            processThinkTags();
                        }
                    }
                } catch (e) {
                    console.error('Error parsing SSE data:', e);
                }
            }
        }
    }

    function processThinkTags() {
        while (streamContentBuffer.length > 0) {
            if (!isThinking) {
                let thinkIdx = streamContentBuffer.indexOf('<think>');
                if (thinkIdx !== -1) {
                    if (thinkIdx > 0) {
                        let contentPart = streamContentBuffer.substring(0, thinkIdx);
                        assistantMessage.content += contentPart;
                        streamRenderer.push('content', contentPart);
                    }
                    isThinking = true;
                    streamContentBuffer = streamContentBuffer.substring(thinkIdx + 7);
                } else {
                    let possibleMatch = false;
                    for (let i = 1; i <= 7 && i <= streamContentBuffer.length; i++) {
                        if ('<think>'.startsWith(streamContentBuffer.substring(streamContentBuffer.length - i))) {
                            possibleMatch = true;
                            let safeLen = streamContentBuffer.length - i;
                            if (safeLen > 0) {
                                let contentPart = streamContentBuffer.substring(0, safeLen);
                                assistantMessage.content += contentPart;
                                streamRenderer.push('content', contentPart);
                                streamContentBuffer = streamContentBuffer.substring(safeLen);
                            }
                            break;
                        }
                    }
                    if (!possibleMatch) {
                        assistantMessage.content += streamContentBuffer;
                        streamRenderer.push('content', streamContentBuffer);
                        streamContentBuffer = '';
                    } else {
                        break; // Wait for more data
                    }
                }
            } else {
                let endThinkIdx = streamContentBuffer.indexOf('</think>');
                if (endThinkIdx !== -1) {
                    if (endThinkIdx > 0) {
                        let thinkPart = streamContentBuffer.substring(0, endThinkIdx);
                        assistantMessage.reasoningContent += thinkPart;
                        streamRenderer.push('reasoning', thinkPart);
                    }
                    isThinking = false;
                    streamContentBuffer = streamContentBuffer.substring(endThinkIdx + 8);
                } else {
                    let possibleMatch = false;
                    for (let i = 1; i <= 8 && i <= streamContentBuffer.length; i++) {
                        if ('</think>'.startsWith(streamContentBuffer.substring(streamContentBuffer.length - i))) {
                            possibleMatch = true;
                            let safeLen = streamContentBuffer.length - i;
                            if (safeLen > 0) {
                                let thinkPart = streamContentBuffer.substring(0, safeLen);
                                assistantMessage.reasoningContent += thinkPart;
                                streamRenderer.push('reasoning', thinkPart);
                                streamContentBuffer = streamContentBuffer.substring(safeLen);
                            }
                            break;
                        }
                    }
                    if (!possibleMatch) {
                        assistantMessage.reasoningContent += streamContentBuffer;
                        streamRenderer.push('reasoning', streamContentBuffer);
                        streamContentBuffer = '';
                    } else {
                        break;
                    }
                }
            }
        }
    }
};

const generateUUID = () => {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const sendMessageToAI = async (messageText, isRegenerate = false, aiMessageIdToRegenerate = undefined) => {
    if (state.isWaitingForResponse) return;

    let currentAssistant = getCurrentAssistantOrDefault();
    
    // 如果没有传入 parentMessageId 且不是重新生成，则默认为当前 active branch 的最后一个 messageId
    let effectiveParentId = null;
    if (!isRegenerate) {
        if (state.activeBranch && state.activeBranch.length > 0) {
            effectiveParentId = state.activeBranch[state.activeBranch.length - 1].messageId;
        }
    } else {
        const oldMsg = state.conversationHistory.find(m => m.messageId === aiMessageIdToRegenerate);
        if (oldMsg) effectiveParentId = oldMsg.parentMessageId;
    }
    
    const parentIdForBackend = effectiveParentId;

    let userMessageId = null;
    if (!isRegenerate) {
        // 显示用户消息
        userMessageId = generateUUID();
        const userMessage = {
            messageId: userMessageId,
            parentMessageId: effectiveParentId,
            role: 'user',
            content: messageText,
            timestamp: Date.now()
        };
        state.conversationHistory.push(userMessage);
        // 更新 activeMessageId 以包含用户消息
        state.activeMessageId = userMessageId;
        buildConversationTree(); // 重建树以更新 activeBranch
        
        displayMessage(userMessage);
        
        effectiveParentId = userMessageId; // AI 消息的 parent 是这个新 User 消息
    }

    // 实时更新当前对话的 messageCount，防止立即点击新建对话时被误判为空对话
    const currentConv = state.conversations.find(c => c.conversationId === state.currentConversationId);
    if (currentConv) {
        currentConv.messageCount = state.conversationHistory.length;
    }

    prepareUIForWaiting();

    let { assistantMessage, assistantMessageElement, streamRenderer, $assistantBubble, $contentTextDiv } = createAssistantMessageUI(currentAssistant, effectiveParentId, isRegenerate);
    
    if (isRegenerate) {
        state.selectedSiblings[effectiveParentId] = assistantMessage.messageId;
        renderChat();
        
        // After renderChat(), the DOM elements are recreated. We need to re-bind streamRenderer to the new DOM element.
        assistantMessageElement = $chatBox.find(`[data-message-id="${assistantMessage.messageId}"]`)[0];
        $assistantBubble = $(assistantMessageElement).find('.bubble');
        $contentTextDiv = $assistantBubble.find('.content-text');
        
        if ($contentTextDiv.length === 0) {
            $contentTextDiv = $('<div>').addClass('content-text');
            $assistantBubble.append($contentTextDiv);
        }
        $contentTextDiv.html('<div class="typing-indicator"><span>思考中</span><div class="dots"><span></span><span></span><span></span></div></div>');
        
        streamRenderer.destroy();
        streamRenderer = createStreamRenderer($assistantBubble, formatContent, () => {
            $assistantBubble.closest('.message').find('.btn-copy-top').show();
            $assistantBubble.closest('.message').find('.message-actions-bottom').css('display', 'flex');
        });
    }

    try {
        const requestBody = {
            conversationId: state.currentConversationId || '',
            prompt: isRegenerate ? '' : messageText,
            model: state.currentModel,
            isRegenerate: isRegenerate,
            parentMessageId: parentIdForBackend || '',
            userMessageId: userMessageId,
            aiMessageId: assistantMessage.messageId
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, 30 * 60 * 1000); // 30分钟超时

        const response = await fetch(getFullUrl('/API/Web/ConversationMessage/Completions'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const result = await response.json();
            if (result.error && result.error.message) {
                throw new Error(result.error.message);
            } else if (result.code !== 200) {
                throw new Error(result.msg || '请求失败');
            } else {
                const content = result.data || result.content || JSON.stringify(result);
                assistantMessage.content = content;
                streamRenderer.push('content', content);
            }
        } else {
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            await processChatStream(response.body.getReader(), assistantMessage, streamRenderer);
        }
        
        // Clear loading indicator if no content was received
        if (!assistantMessage.content && !assistantMessage.reasoningContent) {
            $assistantBubble.find('.typing-indicator').remove();
        }

    } catch (error) {
        console.error('Error communicating with AI:', error);
        if ($contentTextDiv.length > 0) {
            $contentTextDiv.text(`错误: ${error.message}`);
        } else {
            $assistantBubble.text(`错误: ${error.message}`);
        }
        $(assistantMessageElement).addClass('error');
    } finally {
        restoreUIAfterWaiting(streamRenderer);
    }
};

// --- Event Bindings ---
const bindEvents = () => {
    // Reasoning toggle
    $chatBox.on('click', '.reasoning-header', function(e) {
        $(this).closest('.reasoning-container').toggleClass('collapsed');
    });

    // Custom Model Dropdown Events
    const $modelDropdown = $('#custom-model-dropdown');
    const $modelDropdownToggle = $('#model-dropdown-toggle');
    const $modelDropdownMenu = $('#model-dropdown-menu');
    
    $modelDropdownToggle.on('click', function(e) {
        e.stopPropagation();
        $modelDropdown.toggleClass('open');
    });
    
    $(document).on('click', function() {
        $modelDropdown.removeClass('open');
    });
    
    $modelDropdownMenu.on('click', function(e) {
        e.stopPropagation();
    });
    
    $modelDropdownMenu.find('.search-bar input').on('click', function(e) {
        e.stopPropagation();
    }).on('input', function(e) {
        const keyword = $(this).val().toLowerCase();
        $('#model-dropdown-list .dropdown-item').each(function() {
            const modelName = $(this).data('value').toString().toLowerCase();
            if (modelName.includes(keyword)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });
    
    $('#model-dropdown-list').on('click', '.dropdown-item', async function(e) {
        e.stopPropagation(); // 阻止事件冒泡
        const newModel = $(this).data('value');
        $modelDropdown.removeClass('open');
        
        // visual update
        $('#model-dropdown-list .dropdown-item').removeClass('active').css('background', 'transparent');
        $('#model-dropdown-list .dropdown-item .dropdown-item-title').css('color', 'var(--text-main)').css('font-weight', '400');
        $('#model-dropdown-list .dropdown-item .check-icon').remove();
        
        $(this).addClass('active').css('background', 'var(--chat-hover)');
        $(this).find('.dropdown-item-title').css('color', 'var(--brand, #ff512b)').css('font-weight', '500');
        $(this).append('<svg class="check-icon" viewBox="0 0 24 24" width="14" height="14" fill="var(--brand, #ff512b)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>');
        
        $('.selected-model-name').text(newModel);
        
        // Save current model to state
        state.currentModel = newModel;
        state.urlModelForced = false;
    });


    // Quick Cards
    $('.quick-card').on('click', function() {
        const promptText = $(this).data('prompt');
        if (promptText) {
            $userInput.val(promptText).focus();
            $userInput.css('height', 'auto');
            $userInput.css('height', Math.min($userInput[0].scrollHeight, 200) + 'px');
            updateSendBtnState();
        }
    });

    // History Filter Toggle and Search
    $('#history-filter-btn').on('click', function() {
        const $wrap = $('#history-search-wrap');
        $wrap.slideToggle(200, function() {
            if ($wrap.is(':visible')) {
                $('#history-search-input').focus();
            } else {
                $('#history-search-input').val('').trigger('input');
            }
        });
    });

    $('#history-search-input').on('input', function() {
        const keyword = $(this).val().toLowerCase().trim();
        $('.history-item').each(function() {
            const title = $(this).find('.history-title').text().toLowerCase();
            const preview = $(this).find('.history-preview span:first-child').text().toLowerCase();
            if (title.includes(keyword) || preview.includes(keyword)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });

    // Mobile Sidebar Toggle
    const $mobileSidebarToggle = $('#mobile-sidebar-toggle-chat');
    const $sidebarOverlay = $('#sidebar-overlay');

    if ($mobileSidebarToggle.length) {
        $mobileSidebarToggle.on('click', () => {
            $leftSidebar.addClass('open');
            $sidebarOverlay.addClass('active');
        });

        $sidebarOverlay.on('click', hideLeftSidebar);
    }

    // Assistants Events
    $newAssistantBtn.on('click', () => openAssistantForm(null));

    $assistantsListDiv.on('click', 'button', function(e) {
        const id = $(this).data('id');
        if ($(this).hasClass('edit-assistant-btn')) {
            const assistant = state.assistants.find(a => a.assistantId === id);
            if (assistant) openAssistantForm(assistant);
            e.stopPropagation();
        } else if ($(this).hasClass('delete-assistant-btn')) {
            e.stopPropagation();
            if (state.assistants.length <= 1) {
                layer.msg('必须保留至少一个助手', {icon: 0});
                return;
            }
            showCustomConfirm('提示', '确定要删除这个助手吗?', async function() {
                state.assistants = state.assistants.filter(a => a.assistantId !== id);
                await fetchPost(`/API/Web/Assistant/Remove?assistantId=${id}`);
                if (state.currentAssistantId === id) {
                    state.currentAssistantId = state.assistants[0]?.assistantId || null;
                    if (state.currentAssistantId) selectAssistant(state.currentAssistantId);
        else {
            $currentAssistantBadge.text("请新建或选择助手");
            $('#current-assistant-name').text("请新建或选择助手");
        }
                }
                renderAssistantsList();
                layer.msg('已删除');
            });
        }
    });

    // Conversation Events
    $newChatBtn.on('click', () => {
        createNewConversation();
        hideLeftSidebar();
    });

    $historyListDiv.on('click', 'button', function(e) {
        const id = $(this).data('id');

        if ($(this).hasClass('edit-conv-btn')) {
            e.stopPropagation();
            const conversation = state.conversations.find(c => c.conversationId === id);
            if (conversation) {
                const tplHtml = $('#editConvTpl').html();
                layui.laytpl(tplHtml).render(conversation, function(html){
                    $('#editConvModal').remove();
                    $('body').append(html);
                    const $modal = $('#editConvModal');

                    $modal.find('.btn-cancel-edit').on('click', (e) => {
                        e.stopPropagation();
                        $modal.removeClass('active');
                        setTimeout(() => $modal.remove(), 300);
                    });

                    $modal.find('#save-conv-btn').on('click', async () => {
                        const newVal = $modal.find('#conv-title-input').val().trim();
                        if(newVal) {
                            conversation.title = newVal;
                            await fetchPost('/API/Web/Conversation/EditTitle', { conversationId: conversation.conversationId, title: newVal });
                            renderHistoryList();
                            $modal.removeClass('active');
                            setTimeout(() => $modal.remove(), 300);
                            layer.msg('名称已更新');
                        } else {
                            layer.msg('名称不能为空');
                        }
                    });
                });
            }
        } else if ($(this).hasClass('delete-conv-btn')) {
            e.stopPropagation();
            showCustomConfirm('提示', '确定要删除这个对话吗?', async function() {
                await fetchPost(`/API/Web/Conversation/Remove?conversationId=${id}`);
                await reloadHistoryList();
                if (state.currentConversationId === id) {
                    if (state.conversations.length > 0) {
                        switchConversation(state.conversations[0].conversationId);
                    } else {
                        createNewConversation();
                    }
                }
                layer.msg('已删除');
            });
        }
    });

    // Attachment
    if ($attachmentBtn.length && $fileUpload.length) {
        $attachmentBtn.on('click', () => {
            $fileUpload.click();
        });

        const renderAttachedFiles = () => {
            const $previewArea = $('#preview-area');
            $previewArea.empty();
            if (state.attachedFiles.length === 0) {
                $previewArea.css('display', 'none');
                return;
            }
            state.attachedFiles.forEach((file, index) => {
                const $fileDiv = $('<div>').addClass('file-preview-item').css({
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', 
                    background: '#ffffff', borderRadius: '6px', fontSize: '13px',
                    border: '1px solid var(--chat-border)', flexShrink: 0,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                }).html(`
                    <a href="${file.url}" target="_blank" style="color: #1677ff; text-decoration: none; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; vertical-align: middle;">${file.name}</a>
                    <button class="remove-file-btn" data-index="${index}" style="background: transparent; border: none; cursor: pointer; color: #ff4d4f; border-radius: 4px; padding: 2px 4px; font-size: 13px; margin-left: 2px;">删除</button>
                `);
                $previewArea.append($fileDiv);
            });
            $previewArea.css('display', 'flex');
            
            $previewArea.find('.remove-file-btn').on('click', function() {
                const idx = $(this).data('index');
                state.attachedFiles.splice(idx, 1);
                renderAttachedFiles();
                updateSendBtnState();
            });
        };

        const handleFilesUpload = async (files) => {
            if (!files || files.length === 0) return;
            let loadingIdx = layer.msg('文件上传中...', {icon: 16, shade: 0.01, time: 0});
            try {
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    const res = await fetch(getFullUrl('/API/Web/Attachment/UploadFile'), {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();
                    if (data.code === 200) {
                        state.attachedFiles.push({
                            name: data.data.fileName,
                            url: data.data.url
                        });
                    } else {
                        layer.msg(data.msg || '文件上传失败', {icon: 5});
                    }
                }
                if (state.attachedFiles.length > 0) {
                    renderAttachedFiles();
                    updateSendBtnState();
                }
            } catch (err) {
                layer.msg('文件上传异常', {icon: 5});
            } finally {
                layer.close(loadingIdx);
            }
        };

        $fileUpload.on('change', async (e) => {
            await handleFilesUpload(e.target.files);
            $fileUpload.val('');
        });

        $userInput.on('paste', async (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            const files = [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        files.push(file);
                    }
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                await handleFilesUpload(files);
            }
        });
    }

    function updateSendBtnState() {
        const hasText = $userInput.val().trim().length > 0;
        const hasFiles = state.attachedFiles && state.attachedFiles.length > 0;
        if ((hasText || hasFiles) && !state.isWaitingForResponse) {
            $sendBtn.css({
                'background-color': 'var(--brand, #ff512b)',
                'color': 'white'
            });
        } else {
            $sendBtn.css({
                'background-color': '#eeeeef',
                'color': '#a7abb2'
            });
        }
    }

    // Input and Send
    const handleSendMessage = () => {
        let messageText = $userInput.val().trim();
        if ((!messageText && state.attachedFiles.length === 0) || state.isWaitingForResponse) return;

        if (state.attachedFiles.length > 0) {
            const getFileType = (fileName) => {
                const ext = fileName.split('.').pop().toLowerCase();
                return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext) ? '图片' : '附件';
            };
            const attachmentsText = state.attachedFiles.map(f => `${getFileType(f.name)}:[${f.name}](${f.url})`).join('\n');
            messageText = messageText ? `${messageText}\n${attachmentsText}` : attachmentsText;
        }

        $userInput.val('');
        $userInput.css('height', 'auto');
        state.attachedFiles = [];
        $('#preview-area').hide().empty();
        updateSendBtnState();
        sendMessageToAI(messageText);
    };

    $sendBtn.on('click', handleSendMessage);

    $userInput.on('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    $userInput.on('input', function() {
        $(this).css('height', 'auto');
        $(this).css('height', Math.min(this.scrollHeight, 200) + 'px');
        updateSendBtnState();
    });
};

// --- Init ---
const init = async () => {
    $chatBox = $('#chat-box');
    $userInput = $('#user-input');
    $sendBtn = $('#send-btn');
    $currentAssistantBadge = $('#current-assistant-badge');

    // Buttons
    $newChatBtn = $('#new-chat-btn');
    $newAssistantBtn = $('#new-assistant-btn');
    $attachmentBtn = $('#attachment-btn');
    $fileUpload = $('#file-upload');

    // Lists
    $assistantsListDiv = $('#assistants-list');
    $historyListDiv = $('#history-list');

    // Sidebars
    $btnToggleLeft = $('.btn-toggle-left');
    $btnToggleRight = $('.btn-toggle-right');
    $historyPanel = $('#history-panel');
    $assistantsPanel = $('#assistants-panel');
    $leftSidebar = $('.left-sidebar');
    $mobileHistoryBtn = $('#mobile-history-btn');
    $mobileAssistantsBtn = $('#mobile-assistants-btn');

    await loadData();
    
    // 如果URL传入了model参数，则覆盖默认模型（仅在初始化时覆盖一次）
    const urlModel = getQueryParam('model');
    if (urlModel && typeof MODEL_LIST !== 'undefined' && MODEL_LIST.some(m => m.modelName === urlModel)) {
        state.currentModel = urlModel;
        state.urlModelForced = true;
    } else if (typeof MODEL_LIST !== 'undefined' && MODEL_LIST.length > 0) {
        state.currentModel = MODEL_LIST[0].modelName;
    }

    bindEvents();
    renderAssistantsList();
    renderHistoryList();
    renderChat();
    updateCurrentAssistantBadge();
};

$(() => {
    init();
});

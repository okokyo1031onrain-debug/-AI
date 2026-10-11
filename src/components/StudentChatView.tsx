import React, { useState, useRef, useCallback } from 'react';
import {
  Send,
  Image as ImageIcon,
  X,
  Download,
  Copy,
  Check,
  RotateCcw,
  ArrowDown,
  GraduationCap,
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  hasImage?: boolean;
  imageData?: string;
  isError?: boolean;
}

export const StudentChatView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<{
    data: string; // base64
    mimeType: string;
    previewUrl: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track if user is scrolled near bottom
  const isNearBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight);
    const isAtBottom = distanceToBottom < 100;
    isNearBottomRef.current = isAtBottom;
    setShowScrollBottomBtn(!isAtBottom && messages.length > 2);
  }, [messages.length]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Send message to server (stateless on-the-spot response)
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : inputText).trim();
    if ((!text && !selectedImage) || isLoading) return;

    const currentImage = selectedImage;

    // Optimistic UI update: Immediately display user message
    const tempUserId = 'user-' + Date.now();
    const newUserMessage: Message = {
      id: tempUserId,
      role: 'user',
      text: text,
      timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      hasImage: !!currentImage,
      imageData: currentImage ? currentImage.previewUrl : undefined,
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setInputText('');
    setSelectedImage(null);
    setIsLoading(true);

    // Auto-scroll on send
    setTimeout(() => {
      scrollToBottom('smooth');
    }, 50);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      // Send conversation history to API for conversational context
      const historyPayload = messages
        .filter((m) => !m.isError && m.text && m.text.trim().length > 0)
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          image: currentImage
            ? {
                data: currentImage.data,
                mimeType: currentImage.mimeType,
              }
            : undefined,
          history: historyPayload,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        const errorMsg = data.details || data.error || 'AIからの応答を取得できませんでした';
        throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      }

      // Add AI reply
      const newAiMessage: Message = {
        id: 'ai-' + Date.now(),
        role: 'model',
        text: data.reply,
        timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, newAiMessage]);

      if (isNearBottomRef.current) {
        setTimeout(() => {
          scrollToBottom('smooth');
        }, 80);
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMessage: Message = {
        id: 'err-' + Date.now(),
        role: 'model',
        text: `通信エラーが発生しました。（${err?.message || '接続エラー'}）もう一度送信をお試しください。`,
        timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle image upload
  const handleImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('画像ファイル（PNG、JPEGなど）を選択してください。');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('画像サイズは10MB以下にしてください。');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setSelectedImage({
          data: result,
          mimeType: file.type,
          previewUrl: result,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Reset chat
  const handleResetChat = () => {
    if (messages.length === 0) return;
    setMessages([]);
    setInputText('');
    setSelectedImage(null);
  };

  // Export current conversation note as Markdown
  const handleExportMarkdown = () => {
    if (messages.length === 0) return;

    const dateStr = new Date().toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    let md = `# 学習ノート＆AI対話記録\n\n`;
    md += `- **日時**: ${new Date().toLocaleString('ja-JP')}\n\n`;
    md += `---\n\n`;

    messages.forEach((msg, idx) => {
      const sender = msg.role === 'user' ? `🧑‍🎓 生徒` : `👨‍🏫 AI先生`;
      md += `### ${idx + 1}. ${sender} [${msg.timestamp}]\n\n`;
      if (msg.hasImage) {
        md += `*(ノートや問題集の写真を添付)*\n\n`;
      }
      md += `${msg.text}\n\n`;
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `学習ノート_${dateStr.replace(/\//g, '-')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#FDFCF8] text-[#2A2925]">
      {/* Simple Header */}
      <header className="px-4 py-3 shrink-0 flex items-center justify-between border-b border-[#E5E4DE]/60 bg-[#FDFCF8]">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-[#5A5A40] text-[#FDFCF8] flex items-center justify-center font-bold shadow-xs">
            <GraduationCap className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm text-[#2A2925] tracking-tight">まなびAI</span>
        </div>

        {/* Header Right Actions (only visible when messages exist) */}
        <div className="flex items-center space-x-2">
          {messages.length > 0 && (
            <>
              <button
                onClick={handleResetChat}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-[#E5E4DE] bg-white hover:bg-[#F6F5EE] text-xs text-[#626058] hover:text-[#2A2925] transition"
                title="新しい質問を始める"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">新しいチャット</span>
              </button>

              <button
                onClick={handleExportMarkdown}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-[#E5E4DE] bg-white hover:bg-[#F6F5EE] text-xs text-[#5A5A40] transition"
                title="会話履歴を保存"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">保存</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main
        ref={chatContainerRef}
        onScroll={handleScroll}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-w-3xl w-full mx-auto relative flex flex-col"
      >
        {/* Simple Greeting like standard Gemini when no messages */}
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 -mt-12 select-none">
            <h1 className="text-3xl sm:text-4xl font-normal text-[#2A2925] tracking-tight mb-2">
              こんにちは！
            </h1>
            <p className="text-base sm:text-lg text-[#626058] max-w-md leading-relaxed">
              一緒に数学を学んでいきましょう。<br />
              分からないことや気になるところは何でも聞いてね。
            </p>
          </div>
        ) : (
          /* Message List */
          <div className="space-y-4 flex-1">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              return (
                <div
                  key={message.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 relative ${
                      isUser
                        ? 'bg-[#5A5A40] text-[#FDFCF8] rounded-tr-xs shadow-xs'
                        : 'bg-white border border-[#E5E4DE] text-[#2A2925] rounded-tl-xs shadow-2xs'
                    }`}
                  >
                    {/* Image preview in message if attached */}
                    {message.hasImage && message.imageData && (
                      <div className="mb-2.5 rounded-lg overflow-hidden border border-black/10 bg-black/5 max-h-72">
                        <img
                          src={message.imageData}
                          alt="添付されたノート・問題の写真"
                          className="max-h-72 w-auto object-contain rounded-lg"
                        />
                      </div>
                    )}

                    {/* Body Text */}
                    {isUser ? (
                      <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                        {message.text}
                      </div>
                    ) : (
                      <MathRenderer content={message.text} />
                    )}

                    {/* AI Message Footer Actions */}
                    {!isUser && (
                      <div className="mt-2.5 pt-2 border-t border-[#E5E4DE]/60 flex items-center justify-end text-xs text-[#626058]">
                        <button
                          onClick={() => handleCopy(message.text, message.id)}
                          className="flex items-center space-x-1 hover:text-[#2A2925] transition px-1.5 py-0.5 rounded hover:bg-[#F6F5EE]"
                          title="テキストをコピー"
                        >
                          {copiedId === message.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-green-700" />
                              <span className="text-[11px] text-green-700">コピー完了</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span className="text-[11px]">コピー</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Optimistic Thinking State */}
            {isLoading && (
              <div className="flex flex-col items-start space-y-1">
                <div className="bg-white border border-[#E5E4DE] rounded-2xl rounded-tl-xs px-4 py-3 shadow-2xs flex items-center space-x-2 text-sm text-[#5A5A40]">
                  <span className="w-2 h-2 bg-[#5A5A40] rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-[#5A5A40] rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-[#5A5A40] rounded-full animate-bounce" />
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottomBtn && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-28 right-6 z-20 flex items-center space-x-1 px-3 py-1.5 rounded-full bg-[#5A5A40] text-white text-xs shadow-md hover:bg-[#43432F] transition"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>最新メッセージ</span>
        </button>
      )}

      {/* Chat Input Bar */}
      <footer className="bg-[#FDFCF8] p-3 sm:p-4 shrink-0">
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Selected Image Thumbnail Preview */}
          {selectedImage && (
            <div className="flex items-center space-x-2 bg-[#F6F5EE] border border-[#D8D6CE] rounded-xl p-2 max-w-xs">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-white shrink-0 border border-[#E5E4DE]">
                <img
                  src={selectedImage.previewUrl}
                  alt="添付画像"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#2A2925] truncate">画像を添付中</p>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-1 rounded-full text-[#626058] hover:text-red-700 hover:bg-white transition"
                title="添付を削除"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Input Box Bar */}
          <div className="flex items-end space-x-2 bg-white border border-[#D8D6CE] focus-within:border-[#5A5A40] rounded-2xl p-2 shadow-xs transition">
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleImageFile(e.target.files[0]);
                }
              }}
              accept="image/*"
              className="hidden"
            />

            {/* Photo / Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-[#626058] hover:text-[#5A5A40] hover:bg-[#F6F5EE] rounded-xl transition shrink-0"
              title="ノートや問題集の写真を添付"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="数学の質問を入力してください（ノートの写真添付もできます）"
              rows={1}
              className="flex-1 max-h-44 bg-transparent border-0 resize-none text-[15px] text-[#2A2925] focus:outline-none py-1.5 px-1 placeholder-[#626058]/50"
            />

            {/* Send Button */}
            <button
              type="button"
              disabled={(!inputText.trim() && !selectedImage) || isLoading}
              onClick={() => handleSendMessage()}
              className={`p-2.5 rounded-xl shrink-0 transition flex items-center justify-center ${
                (inputText.trim() || selectedImage) && !isLoading
                  ? 'bg-[#5A5A40] hover:bg-[#43432F] text-white shadow-xs'
                  : 'bg-[#E5E4DE] text-[#626058]/40 cursor-not-allowed'
              }`}
              title="送信"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

import React, { useMemo } from 'react';
import katex from 'katex';

interface MathRendererProps {
  content: string;
  className?: string;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ content, className = '' }) => {
  const renderedContent = useMemo(() => {
    if (!content) return null;

    // Split content by display math ($$...$$) first, then inline math ($...$)
    // We should be careful not to split currency like $10 unless surrounded by spaces
    const lines = content.split('\n');

    return lines.map((line, lineIdx) => {
      // Check if line is a display math block $$...$$
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('$$') && trimmedLine.endsWith('$$') && trimmedLine.length >= 4) {
        const mathExpr = trimmedLine.slice(2, -2).trim();
        try {
          const html = katex.renderToString(mathExpr, {
            displayMode: true,
            throwOnError: false,
          });
          return (
            <div
              key={`line-${lineIdx}`}
              className="my-2.5 overflow-x-auto py-1"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return (
            <div key={`line-${lineIdx}`} className="my-2 text-center font-mono text-sm text-[#5A5A40]">
              {trimmedLine}
            </div>
          );
        }
      }

      // Check if line is a bullet point or list
      let linePrefix = '';
      let textContent = line;
      if (line.startsWith('- ') || line.startsWith('* ')) {
        linePrefix = '• ';
        textContent = line.slice(2);
      } else if (/^\d+\.\s/.test(line)) {
        const match = line.match(/^(\d+\.\s)(.*)$/);
        if (match) {
          linePrefix = match[1];
          textContent = match[2];
        }
      } else if (line.startsWith('### ')) {
        return (
          <h4 key={`line-${lineIdx}`} className="font-bold text-[#2A2925] mt-3 mb-1 text-base">
            {renderInlineMathAndFormatting(line.slice(4))}
          </h4>
        );
      } else if (line.startsWith('## ')) {
        return (
          <h3 key={`line-${lineIdx}`} className="font-bold text-[#2A2925] mt-3.5 mb-1.5 text-lg">
            {renderInlineMathAndFormatting(line.slice(3))}
          </h3>
        );
      }

      if (!line.trim()) {
        return <div key={`line-${lineIdx}`} className="h-2" />;
      }

      return (
        <p key={`line-${lineIdx}`} className="my-1 leading-relaxed">
          {linePrefix && <span className="font-semibold text-[#5A5A40] mr-1">{linePrefix}</span>}
          {renderInlineMathAndFormatting(textContent)}
        </p>
      );
    });
  }, [content]);

  return <div className={`text-[#2A2925] text-[15px] space-y-0.5 ${className}`}>{renderedContent}</div>;
};

// Helper function to parse inline math $...$ and **bold**
function renderInlineMathAndFormatting(text: string): React.ReactNode[] {
  // Regex pattern to split by display math $$...$$, inline math $...$, or bold **...**
  const regex = /(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$|\*\*[^*]+?\*\*)/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Check display math $$...$$
    if (part.startsWith('$$') && part.endsWith('$$')) {
      const expr = part.slice(2, -2).trim();
      try {
        const html = katex.renderToString(expr, { displayMode: true, throwOnError: false });
        return <span key={idx} dangerouslySetInnerHTML={{ __html: html }} />;
      } catch {
        return <code key={idx} className="font-mono text-xs">{part}</code>;
      }
    }

    // Check inline math $...$
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const expr = part.slice(1, -1).trim();
      try {
        const html = katex.renderToString(expr, { displayMode: false, throwOnError: false });
        return <span key={idx} dangerouslySetInnerHTML={{ __html: html }} />;
      } catch {
        return <code key={idx} className="font-mono text-xs">{part}</code>;
      }
    }

    // Check bold **...**
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-[#2A2925]">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={idx}>{part}</span>;
  });
}

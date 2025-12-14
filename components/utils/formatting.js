// formatting.js
// Reusable markdown rendering and lightweight syntax highlighting utilities

export function preprocessAIResponse(response) {
  if (!response) return '';
  let cleaned = response;
  cleaned = cleaned.replace(/```markdown\n([\s\S]*?)\n```/g, '$1');
  cleaned = cleaned.replace(/```markdown\n([\s\S]*?)$/g, '$1');
  return cleaned.trim();
}

export function markdownToHtml(markdown) {
  if (!markdown) return '';

  const escapeHtml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const allowedLanguages = new Set(['js','javascript','ts','typescript','json','bash','sh','shell','diff','html','css','md','markdown','yaml','yml','python','py','go','rust','java','kotlin','swift','c','cpp','php','sql']);

  // Balance fences strictly by line so we don't append extra accidentally
  const opens = (markdown.match(/^```(?:\w+)?\s*$/gm) || []).length;
  const closes = (markdown.match(/^```\s*$/gm) || []).length;
  if (opens > closes) {
    markdown = markdown + '\n```'.repeat(opens - closes);
  }

  // Extract code blocks first to protect them from other markdown processing
  const codeBlockPlaceholders = [];
  let processedMarkdown = markdown.replace(/```(\w+)?\r?\n([\s\S]*?)```/g, (match, lang, code) => {
    const language = (lang || '').toLowerCase();
    const className = allowedLanguages.has(language) ? `language-${language}` : 'language-plaintext';
    const escaped = escapeHtml(code);
    if (escaped.trim() === '') return '';
    const placeholderId = codeBlockPlaceholders.length;
    codeBlockPlaceholders.push(`<pre><code class="${className}">${escaped}</code></pre>`);
    return `@@CODE_BLOCK_${placeholderId}@@`;
  });

  // Remove stray standalone fences
  processedMarkdown = processedMarkdown.replace(/^```(?:\w+)?\s*$/gm, '').replace(/^```\s*$/gm, '');

  // Extract markdown tables before other processing
  const tablePlaceholders = [];
  processedMarkdown = processedMarkdown.replace(/(?:^|\n)(\|[^\n]+\|\r?\n(?:\|[\s\-\:]+\|\r?\n)?(?:\|[^\n]+\|\r?\n?)+)/gm, (match) => {
    // Parse the table
    const lines = match.trim().split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return match; // Need at least header and separator
    
    // Parse header row - handle empty cells at start/end
    const headerRow = lines[0];
    const headerCells = headerRow.split('|').map(cell => cell.trim());
    // Remove empty cells at start and end (markdown tables often have them)
    if (headerCells[0] === '') headerCells.shift();
    if (headerCells[headerCells.length - 1] === '') headerCells.pop();
    
    // Parse separator row to determine alignment
    const separatorRow = lines[1];
    const separatorCells = separatorRow.split('|').map(cell => cell.trim());
    // Remove empty cells at start and end
    const cleanSeparatorCells = [...separatorCells];
    if (cleanSeparatorCells[0] === '') cleanSeparatorCells.shift();
    if (cleanSeparatorCells[cleanSeparatorCells.length - 1] === '') cleanSeparatorCells.pop();
    
    const alignments = cleanSeparatorCells.map(sep => {
      const trimmed = sep.trim();
      if (/^:[\-\s]+:$/.test(trimmed)) return 'center';
      if (/^[\-\s]+:$/.test(trimmed)) return 'right';
      return 'left'; // default
    });
    
    // Store table data for later processing (after markdown formatting)
    const tableData = {
      headerCells: headerCells,
      alignments: alignments,
      dataRows: []
    };
    
    // Parse data rows
    for (let i = 2; i < lines.length; i++) {
      const row = lines[i];
      const cells = row.split('|').map(cell => cell.trim());
      // Remove empty cells at start and end
      const cleanCells = [...cells];
      if (cleanCells[0] === '') cleanCells.shift();
      if (cleanCells[cleanCells.length - 1] === '') cleanCells.pop();
      if (cleanCells.length > 0) {
        tableData.dataRows.push(cleanCells);
      }
    }
    
    const placeholderId = tablePlaceholders.length;
    tablePlaceholders.push(tableData);
    return `@@TABLE_${placeholderId}@@`;
  });

  // Process markdown (excluding code blocks)
  let html = processedMarkdown
    // Inline code
    .replace(/`([^`]+)`/g, (m, code) => `<code>${escapeHtml(code)}</code>`)
    // Bold/italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Blockquotes
    .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
    // Lists
    .replace(/^[\s]*[-*]\s+(.*$)/gim, '<li>$1</li>')
    // Line breaks (only for non-code content)
    .replace(/\n/g, '<br>');

  // Wrap sequences of list items into <ul>
  html = html.replace(/(?:<br>)*(<li>[\s\S]*?<\/li>)(?:(?:<br>)+<li>[\s\S]*?<\/li>)+(?:<br>)*/g,
    (m) => `<ul>${m.replace(/<br>/g, '')}</ul>`);
  html = html.replace(/(^|<br>)(<li>[\s\S]*?<\/li>)(?=$|<br>)/g, (m, pre, item) => `${pre}<ul>${item}</ul>`);

  // Restore code blocks and wrap with header/copy button
  html = html.replace(/@@CODE_BLOCK_(\d+)@@/g, (match, id) => {
    const codeBlock = codeBlockPlaceholders[Number(id)];
    if (!codeBlock) return '';
    const matchResult = codeBlock.match(/<pre><code class="(language-[^"]+)">([\s\S]*?)<\/code><\/pre>/);
    if (!matchResult) return codeBlock;
    const [, cls, inner] = matchResult;
    const lang = (cls.replace('language-', '') || 'text').toLowerCase();
    return `\n<div class="thinkreview-code-block">\n  <div class="thinkreview-code-header">\n    <span class="thinkreview-code-lang">${lang}</span>\n    <button class="thinkreview-copy-btn" title="Copy code">Copy code<\/button>\n  <\/div>\n  <pre><code class="${cls}">${inner}<\/code><\/pre>\n<\/div>`;
  });

  // Restore tables - process markdown in cells first
  html = html.replace(/@@TABLE_(\d+)@@/g, (match, id) => {
    const tableData = tablePlaceholders[Number(id)];
    if (!tableData || !tableData.headerCells) return '';
    
    // Helper to process markdown in cell content
    const processCellContent = (cellContent) => {
      if (!cellContent) return '';
      let processed = cellContent;
      
      // Process markdown patterns first, escaping content inside
      processed = processed
        .replace(/`([^`]+)`/g, (match, code) => `<code>${escapeHtml(code)}</code>`)
        .replace(/\*\*(.*?)\*\*/g, (match, text) => `<strong>${escapeHtml(text)}</strong>`)
        .replace(/\*(.*?)\*/g, (match, text) => `<em>${escapeHtml(text)}</em>`);
      
      // Escape any remaining HTML tags that weren't part of markdown
      // But preserve the tags we just created
      const tagPlaceholders = [];
      processed = processed.replace(/(<(code|strong|em)[^>]*>[\s\S]*?<\/\2>)/g, (match) => {
        const id = tagPlaceholders.length;
        tagPlaceholders.push(match);
        return `@@TAG_${id}@@`;
      });
      
      // Escape remaining HTML
      processed = escapeHtml(processed);
      
      // Restore our markdown-generated tags
      tagPlaceholders.forEach((tag, id) => {
        processed = processed.replace(`@@TAG_${id}@@`, tag);
      });
      
      return processed;
    };
    
    // Helper function to generate cell HTML with alignment
    const createCellHtml = (cell, index, tag = 'td') => {
      const align = tableData.alignments[index] || 'left';
      const style = align !== 'left' ? ` style="text-align: ${align}"` : '';
      const processedCell = processCellContent(cell);
      return `<${tag}${style}>${processedCell}</${tag}>\n`;
    };
    
    // Build table HTML
    let tableHtml = '<table class="thinkreview-table">\n<thead>\n<tr>\n';
    tableData.headerCells.forEach((cell, index) => {
      tableHtml += createCellHtml(cell, index, 'th');
    });
    tableHtml += '</tr>\n</thead>\n<tbody>\n';
    
    // Process data rows
    tableData.dataRows.forEach(row => {
      tableHtml += '<tr>\n';
      row.forEach((cell, index) => {
        tableHtml += createCellHtml(cell, index, 'td');
      });
      tableHtml += '</tr>\n';
    });
    
    tableHtml += '</tbody>\n</table>';
    return tableHtml;
  });

  return html;
}

export function applySimpleSyntaxHighlighting(rootElement) {
  const root = rootElement || document;
  const codeBlocks = root.querySelectorAll('pre code[class^="language-"], pre code[class*=" language-"]');
  if (!codeBlocks || codeBlocks.length === 0) return;

  const highlight = (code, lang) => {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const jsTs = () => {
      let s = esc(code);
      s = s.replace(/(^|\s)(\/\/.*?$)/gm, '$1<span class="token comment">$2<\/span>');
      s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="token comment">${m}<\/span>`);
      s = s.replace(/(['"`])(?:\\.|(?!\1).)*\1/gm, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/\b(0x[\da-fA-F]+|\d+\.?\d*|\.\d+)\b/g, '<span class="token number">$1<\/span>');
      s = s.replace(/\b(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|null|of|return|super|switch|this|throw|true|try|typeof|undefined|var|void|while|with|yield)\b/g, '<span class="token keyword">$1<\/span>');
      s = s.replace(/\b([a-zA-Z_$][\w$]*)\s*(?=\()/g, '<span class="token function">$1<\/span>');
      return s;
    };

    const json = () => {
      let s = esc(code);
      s = s.replace(/("(\\.|[^"])*")\s*:/g, '<span class="token property">$1<\/span>:');
      s = s.replace(/:"(\\.|[^"])*"/g, (m) => m.replace(/"(.*)"/, '<span class="token string">"$1"<\/span>'));
      s = s.replace(/\b(true|false|null)\b/g, '<span class="token keyword">$1<\/span>');
      s = s.replace(/\b(0x[\da-fA-F]+|\d+\.?\d*|\.\d+)\b/g, '<span class="token number">$1<\/span>');
      return s;
    };

    const bash = () => {
      let s = esc(code);
      s = s.replace(/(^|\n)#[^\n]*/g, (m) => `<span class="token comment">${m}<\/span>`);
      s = s.replace(/\b(echo|cd|ls|cat|grep|awk|sed|export|source|sudo|rm|cp|mv|chmod|chown|tar|curl|wget|npm|yarn|pnpm|git)\b/g, '<span class="token builtin">$1<\/span>');
      s = s.replace(/\$[A-Za-z_][\w_]*/g, '<span class="token variable">$&<\/span>');
      s = s.replace(/(['"])((?:\\.|(?!\1).)*)\1/g, '<span class="token string">$1$2$1<\/span>');
      return s;
    };

    const diff = () => {
      let s = esc(code);
      s = s.replace(/^\+.*$/gm, '<span class="token insert">$&<\/span>');
      s = s.replace(/^\-.*$/gm, '<span class="token delete">$&<\/span>');
      s = s.replace(/^@@.*@@.*$/gm, '<span class="token hunk">$&<\/span>');
      return s;
    };

    const yaml = () => {
      let s = esc(code);
      s = s.replace(/(^|\n)#[^\n]*/g, (m) => `<span class="token comment">${m}<\/span>`);
      s = s.replace(/(^|\n)(\s*)([\w\-]+):/g, '$1$2<span class="token property">$3<\/span>:');
      s = s.replace(/:\s*(true|false|null)\b/g, ': <span class="token keyword">$1<\/span>');
      s = s.replace(/:\s*(\d+\.?\d*)\b/g, ': <span class="token number">$1<\/span>');
      return s;
    };

    const python = () => {
      let s = esc(code);
      s = s.replace(/(^|\s)#.*$/gm, '$1<span class="token comment">$&<\/span>');
      s = s.replace(/(['"])\1\1[\s\S]*?\1\1\1/gm, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/(['"]).*?\1/gm, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/\b(def|class|import|from|as|if|elif|else|for|while|try|except|finally|return|with|yield|lambda|True|False|None|and|or|not|in|is)\b/g, '<span class="token keyword">$1<\/span>');
      s = s.replace(/\b(\d+\.?\d*)\b/g, '<span class="token number">$1<\/span>');
      return s;
    };

    const sql = () => {
      let s = esc(code);
      s = s.replace(/--.*$/gm, (m) => `<span class="token comment">${m}<\/span>`);
      s = s.replace(/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|REPLACE|FUNCTION|RETURNS|TABLE|FROM|WHERE|AND|OR|NOT|IN|AS|ON|JOIN|INNER|LEFT|RIGHT|OUTER|GROUP|BY|ORDER|LIMIT|OFFSET|VALUES|RETURNING|LANGUAGE|SECURITY|DEFINER|BEGIN|END)\b/gi, '<span class="token keyword">$1<\/span>');
      s = s.replace(/'([^']|''|\\')*'/g, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/\b(\d+\.?\d*)\b/g, '<span class="token number">$1<\/span>');
      return s;
    };

    const php = () => {
      let s = esc(code);
      // PHP opening/closing tags first (before other processing)
      s = s.replace(/(&lt;\?php|\?&gt;)/gi, '<span class="token keyword">$1<\/span>');
      // Comments: // and # style
      s = s.replace(/(^|\s)(\/\/.*?$)/gm, '$1<span class="token comment">$2<\/span>');
      s = s.replace(/(^|\s)(#.*?$)/gm, '$1<span class="token comment">$2<\/span>');
      s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="token comment">${m}<\/span>`);
      // Strings: single and double quoted (but not inside comments)
      s = s.replace(/(['"])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="token string">$1$2$1<\/span>');
      // Variables (must be after string matching to avoid matching inside strings)
      s = s.replace(/\$[a-zA-Z_][a-zA-Z0-9_]*/g, '<span class="token variable">$&<\/span>');
      // Numbers
      s = s.replace(/\b(0x[\da-fA-F]+|\d+\.?\d*|\.\d+)\b/g, '<span class="token number">$1<\/span>');
      // Keywords (be careful with ordering - do after strings and variables)
      s = s.replace(/\b(function|class|namespace|use|extends|implements|public|private|protected|static|const|var|if|else|elseif|foreach|for|while|do|switch|case|default|break|continue|return|try|catch|finally|throw|new|instanceof|as|and|or|xor|array|echo|print|require|include|require_once|include_once|true|false|null)\b/gi, '<span class="token keyword">$1<\/span>');
      // Functions (simple heuristic: word followed by opening paren, skip if already tokenized or a keyword)
      s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, (match, funcName) => {
        // Check if this word is already inside a token span or is a keyword
        const keywords = ['function', 'class', 'namespace', 'use', 'extends', 'implements', 'public', 'private', 'protected', 'static', 'const', 'var', 'if', 'else', 'elseif', 'foreach', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'instanceof', 'as', 'and', 'or', 'xor', 'array', 'echo', 'print', 'require', 'include', 'require_once', 'include_once', 'true', 'false', 'null'];
        if (keywords.includes(funcName.toLowerCase())) return match;
        // Use a lookbehind to check if already tokenized (simplified check)
        return `<span class="token function">${funcName}<\/span>` + match.substring(funcName.length);
      });
      return s;
    };

    switch (lang) {
      case 'js':
      case 'javascript':
      case 'ts':
      case 'typescript':
        return jsTs();
      case 'json':
        return json();
      case 'bash':
      case 'sh':
      case 'shell':
        return bash();
      case 'diff':
        return diff();
      case 'yaml':
      case 'yml':
        return yaml();
      case 'py':
      case 'python':
        return python();
      case 'sql':
        return sql();
      case 'php':
        return php();
      default:
        return esc(code);
    }
  };

  codeBlocks.forEach((el) => {
    const classList = el.className || '';
    const match = classList.match(/language-([\w-]+)/);
    const lang = match ? match[1].toLowerCase() : 'plaintext';
    const original = el.textContent || '';
    const highlighted = highlight(original, lang);
    if (!/class=\"token /.test(el.innerHTML)) {
      el.innerHTML = highlighted;
    }
  });
}

export function setupCopyHandler() {
  document.addEventListener('click', (event) => {
    const btn = event.target && event.target.closest && event.target.closest('.thinkreview-copy-btn');
    if (!btn) return;
    const container = btn.closest('.thinkreview-code-block');
    if (!container) return;
    const codeEl = container.querySelector('pre code');
    if (!codeEl) return;
    const text = codeEl.textContent || '';
    try {
      navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = 'Copied';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1200);
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  });
}



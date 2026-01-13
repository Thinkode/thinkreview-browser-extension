// formatting.js
// Reusable markdown rendering and lightweight syntax highlighting utilities

export function preprocessAIResponse(response) {
  if (!response) return '';
  let cleaned = response;
  
  // Remove outer markdown code blocks if present
  cleaned = cleaned.replace(/```markdown\n([\s\S]*?)\n```/g, '$1');
  cleaned = cleaned.replace(/```markdown\n([\s\S]*?)$/g, '$1');
  
  // Strip any accidental HTML tags or malformed syntax highlighting from AI response
  // This prevents broken HTML like 'class="token comment"' without proper <span> tags
  // Remove malformed token attributes that aren't inside proper HTML tags
  cleaned = cleaned.replace(/class=["']token\s+\w+["']\s*>/g, '');
  cleaned = cleaned.replace(/class=class=["']token\s+\w+["']\s*>/g, '');
  
  // Remove any orphaned HTML-like fragments within code blocks (but preserve markdown code fences)
  // This regex looks for suspicious patterns like standalone 'class="...">' without opening tags
  cleaned = cleaned.replace(/(?<!<[a-z]\w*\s)class=["'][^"']*["']\s*>/gi, '');
  
  return cleaned.trim();
}

export function markdownToHtml(markdown) {
  if (!markdown) return '';

  const escapeHtml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const allowedLanguages = new Set(['js','javascript','ts','typescript','json','bash','sh','shell','diff','html','htm','css','scss','sass','md','markdown','yaml','yml','python','py','go','golang','rust','rs','java','kotlin','kt','swift','c','cpp','c++','cxx','csharp','cs','c#','dotnet','php','sql','ruby','rb']);

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
    // Use ThinkReview-specific prefix to prevent collision with user content
    return `__THINKREVIEW_CODE_BLOCK_${placeholderId}__`;
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
    // Use ThinkReview-specific prefix to prevent collision with user content
    return `__THINKREVIEW_TABLE_${placeholderId}__`;
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
  html = html.replace(/__THINKREVIEW_CODE_BLOCK_(\d+)__/g, (match, id) => {
    const codeBlock = codeBlockPlaceholders[Number(id)];
    if (!codeBlock) return '';
    const matchResult = codeBlock.match(/<pre><code class="(language-[^"]+)">([\s\S]*?)<\/code><\/pre>/);
    if (!matchResult) return codeBlock;
    const [, cls, inner] = matchResult;
    const lang = (cls.replace('language-', '') || 'text').toLowerCase();
    return `\n<div class="thinkreview-code-block">\n  <div class="thinkreview-code-header">\n    <span class="thinkreview-code-lang">${lang}</span>\n    <button class="thinkreview-copy-btn" title="Copy code">Copy code<\/button>\n  <\/div>\n  <pre><code class="${cls}">${inner}<\/code><\/pre>\n<\/div>`;
  });

  // Restore tables - process markdown in cells first
  html = html.replace(/__THINKREVIEW_TABLE_(\d+)__/g, (match, id) => {
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
        // Use ThinkReview-specific prefix to prevent collision with user content
        return `__THINKREVIEW_TAG_${id}__`;
      });
      
      // Escape remaining HTML
      processed = escapeHtml(processed);
      
      // Restore our markdown-generated tags
      tagPlaceholders.forEach((tag, id) => {
        processed = processed.replace(`__THINKREVIEW_TAG_${id}__`, tag);
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
      const PLACEHOLDER_PREFIX = '\x00THINKR';
      const PLACEHOLDER_SUFFIX = 'THINKR\x00';
      const placeholders = [];
      const createPlaceholder = (html) => {
        const id = placeholders.length;
        placeholders.push(html);
        return `${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`;
      };
      
      s = s.replace(/(\/\/[^\n]*)/gm, (match) => 
        createPlaceholder(`<span class="token comment">${match}<\/span>`)
      );
      s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => createPlaceholder(`<span class="token comment">${m}<\/span>`));
      s = s.replace(/(['"`])(?:\\.|(?!\1).)*\1/gm, (m) => createPlaceholder(`<span class="token string">${m}<\/span>`));
      s = s.replace(/\b(0x[\da-fA-F]+|\d+\.?\d*|\.\d+)\b/g, (m) => createPlaceholder(`<span class="token number">${m}<\/span>`));
      s = s.replace(/\b(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|null|of|return|super|switch|this|throw|true|try|typeof|undefined|var|void|while|with|yield)\b/g, (m) => createPlaceholder(`<span class="token keyword">${m}<\/span>`));
      s = s.replace(/\b([a-zA-Z_$][\w$]*)\s*(?=\()/g, (match, funcName) => 
        createPlaceholder(`<span class="token function">${funcName}<\/span>`) + match.substring(funcName.length)
      );
      
      placeholders.forEach((html, id) => {
        s = s.replace(new RegExp(`${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`, 'g'), html);
      });
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
      s = s.replace(/(#[^\n]*)/g, (m) => `<span class="token comment">${m}<\/span>`);
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
      s = s.replace(/(#[^\n]*)/g, (m) => `<span class="token comment">${m}<\/span>`);
      s = s.replace(/(^|\n)(\s*)([\w\-]+):/g, '$1$2<span class="token property">$3<\/span>:');
      s = s.replace(/:\s*(true|false|null)\b/g, ': <span class="token keyword">$1<\/span>');
      s = s.replace(/:\s*(\d+\.?\d*)\b/g, ': <span class="token number">$1<\/span>');
      return s;
    };

    const python = () => {
      let s = esc(code);
      const PLACEHOLDER_PREFIX = '\x00THINKR';
      const PLACEHOLDER_SUFFIX = 'THINKR\x00';
      const placeholders = [];
      const createPlaceholder = (html) => {
        const id = placeholders.length;
        placeholders.push(html);
        return `${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`;
      };
      
      s = s.replace(/(#[^\n]*)/gm, (match) => 
        createPlaceholder(`<span class="token comment">${match}<\/span>`)
      );
      s = s.replace(/(['"])\1\1[\s\S]*?\1\1\1/gm, (m) => createPlaceholder(`<span class="token string">${m}<\/span>`));
      s = s.replace(/(['"])[^\1]*?\1/gm, (m) => createPlaceholder(`<span class="token string">${m}<\/span>`));
      s = s.replace(/\b(def|class|import|from|as|if|elif|else|for|while|try|except|finally|return|with|yield|lambda|True|False|None|and|or|not|in|is)\b/g, (m) => createPlaceholder(`<span class="token keyword">${m}<\/span>`));
      s = s.replace(/\b(\d+\.?\d*)\b/g, (m) => createPlaceholder(`<span class="token number">${m}<\/span>`));
      
      placeholders.forEach((html, id) => {
        s = s.replace(new RegExp(`${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`, 'g'), html);
      });
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
      
      // CRITICAL: To prevent double-highlighting corruption, we use placeholders
      // that cannot be matched by subsequent regex patterns
      const PLACEHOLDER_PREFIX = '\x00THINKR';
      const PLACEHOLDER_SUFFIX = 'THINKR\x00';
      const placeholders = [];
      
      const createPlaceholder = (html) => {
        const id = placeholders.length;
        placeholders.push(html);
        return `${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`;
      };
      
      // PHP opening/closing tags first (before other processing)
      s = s.replace(/(&lt;\?php|\?&gt;)/gi, (m) => createPlaceholder(`<span class="token keyword">${m}<\/span>`));
      
      // Comments: // and # style (match more comprehensively)
      s = s.replace(/(\/\/[^\n]*)/gm, (match) => 
        createPlaceholder(`<span class="token comment">${match}<\/span>`)
      );
      s = s.replace(/(#[^\n]*)/gm, (match) => 
        createPlaceholder(`<span class="token comment">${match}<\/span>`)
      );
      s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => createPlaceholder(`<span class="token comment">${m}<\/span>`));
      
      // Strings: single and double quoted
      s = s.replace(/(['"])((?:\\.|(?!\1)[^\\])*?)\1/g, (match) => 
        createPlaceholder(`<span class="token string">${match}<\/span>`)
      );
      
      // Variables
      s = s.replace(/\$[a-zA-Z_][a-zA-Z0-9_]*/g, (m) => 
        createPlaceholder(`<span class="token variable">${m}<\/span>`)
      );
      
      // Numbers
      s = s.replace(/\b(0x[\da-fA-F]+|\d+\.?\d*|\.\d+)\b/g, (m) => 
        createPlaceholder(`<span class="token number">${m}<\/span>`)
      );
      
      // Keywords
      s = s.replace(/\b(function|class|namespace|use|extends|implements|public|private|protected|static|const|var|if|else|elseif|foreach|for|while|do|switch|case|default|break|continue|return|try|catch|finally|throw|new|instanceof|as|and|or|xor|array|echo|print|require|include|require_once|include_once|true|false|null)\b/gi, (m) => 
        createPlaceholder(`<span class="token keyword">${m}<\/span>`)
      );
      
      // Functions (carefully check it's not already in a placeholder)
      s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, (match, funcName) => {
        const keywords = ['function', 'class', 'namespace', 'use', 'extends', 'implements', 'public', 'private', 'protected', 'static', 'const', 'var', 'if', 'else', 'elseif', 'foreach', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'new', 'instanceof', 'as', 'and', 'or', 'xor', 'array', 'echo', 'print', 'require', 'include', 'require_once', 'include_once', 'true', 'false', 'null'];
        if (keywords.includes(funcName.toLowerCase())) return match;
        return createPlaceholder(`<span class="token function">${funcName}<\/span>`) + match.substring(funcName.length);
      });
      
      // Restore all placeholders
      placeholders.forEach((html, id) => {
        s = s.replace(new RegExp(`${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`, 'g'), html);
      });
      
      return s;
    };

    const go = () => {
      let s = esc(code);
      // Comments
      s = s.replace(/(\/\/[^\n]*)/gm, (m) => `<span class="token comment">${m}<\/span>`);
      s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="token comment">${m}<\/span>`);
      // Strings (raw strings, double quotes, backticks)
      s = s.replace(/`[^`]*`/g, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/"(?:\\.|[^"\\])*"/g, (m) => `<span class="token string">${m}<\/span>`);
      // Numbers
      s = s.replace(/\b(0x[\da-fA-F]+|\d+\.?\d*|\.\d+)\b/g, '<span class="token number">$1<\/span>');
      // Keywords
      s = s.replace(/\b(break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var|true|false|nil|iota)\b/g, '<span class="token keyword">$1<\/span>');
      // Built-in functions
      s = s.replace(/\b(append|cap|close|complex|copy|delete|imag|len|make|new|panic|print|println|real|recover)\b/g, '<span class="token builtin">$1<\/span>');
      // Functions
      s = s.replace(/\b([a-zA-Z_][\w]*)\s*(?=\()/g, '<span class="token function">$1<\/span>');
      return s;
    };

    const rust = () => {
      let s = esc(code);
      // Comments
      s = s.replace(/(\/\/[^\n]*)/gm, (m) => `<span class="token comment">${m}<\/span>`);
      s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="token comment">${m}<\/span>`);
      // Strings (raw strings and regular strings)
      s = s.replace(/r#+"[^"]*"#*"/g, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/"(?:\\.|[^"\\])*"/g, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/'(?:\\.|[^'\\])'/g, (m) => `<span class="token string">${m}<\/span>`);
      // Numbers
      s = s.replace(/\b(0x[\da-fA-F]+|\d+\.?\d*|\.\d+)\b/g, '<span class="token number">$1<\/span>');
      // Keywords
      s = s.replace(/\b(as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|true|type|unsafe|use|where|while)\b/g, '<span class="token keyword">$1<\/span>');
      // Built-in macros
      s = s.replace(/\b(println|print|panic|assert|assert_eq|vec|format|include_str|include_bytes)!\b/g, '<span class="token builtin">$1!<\/span>');
      // Functions
      s = s.replace(/\b([a-zA-Z_][\w]*)\s*(?=\()/g, '<span class="token function">$1<\/span>');
      return s;
    };

    const java = () => {
      let s = esc(code);
      // Comments
      s = s.replace(/(\/\/[^\n]*)/gm, (m) => `<span class="token comment">${m}<\/span>`);
      s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="token comment">${m}<\/span>`);
      // Strings
      s = s.replace(/"(?:\\.|[^"\\])*"/g, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/'(?:\\.|[^'\\])'/g, (m) => `<span class="token string">${m}<\/span>`);
      // Numbers
      s = s.replace(/\b(0x[\da-fA-F]+|\d+\.?\d*[fFdDlL]?|\.\d+)\b/g, '<span class="token number">$1<\/span>');
      // Keywords
      s = s.replace(/\b(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|null|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|true|false)\b/g, '<span class="token keyword">$1<\/span>');
      // Functions
      s = s.replace(/\b([a-zA-Z_][\w]*)\s*(?=\()/g, '<span class="token function">$1<\/span>');
      return s;
    };

    const kotlin = () => {
      let s = esc(code);
      // Comments
      s = s.replace(/(\/\/[^\n]*)/gm, (m) => `<span class="token comment">${m}<\/span>`);
      s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="token comment">${m}<\/span>`);
      // Strings (including raw strings)
      s = s.replace(/"""[\s\S]*?"""/g, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/"(?:\\.|[^"\\])*"/g, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/'(?:\\.|[^'\\])'/g, (m) => `<span class="token string">${m}<\/span>`);
      // Numbers
      s = s.replace(/\b(0x[\da-fA-F]+|\d+\.?\d*[fFdDlL]?|\.\d+)\b/g, '<span class="token number">$1<\/span>');
      // Keywords
      s = s.replace(/\b(abstract|actual|annotation|as|break|by|catch|class|companion|const|constructor|continue|crossinline|data|do|dynamic|else|enum|expect|external|false|final|finally|for|fun|get|if|import|in|infix|init|inline|inner|interface|internal|is|lateinit|null|object|open|operator|out|override|package|private|protected|public|reified|return|sealed|set|super|suspend|tailrec|this|throw|true|try|typealias|typeof|val|var|vararg|when|where|while)\b/g, '<span class="token keyword">$1<\/span>');
      // Functions
      s = s.replace(/\b([a-zA-Z_][\w]*)\s*(?=\()/g, '<span class="token function">$1<\/span>');
      return s;
    };

    const cpp = () => {
      let s = esc(code);
      // Comments
      s = s.replace(/(\/\/[^\n]*)/gm, (m) => `<span class="token comment">${m}<\/span>`);
      s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="token comment">${m}<\/span>`);
      // Preprocessor directives
      s = s.replace(/^#\s*(include|define|ifdef|ifndef|endif|pragma|error).*$/gm, (m) => `<span class="token builtin">${m}<\/span>`);
      // Strings
      s = s.replace(/"(?:\\.|[^"\\])*"/g, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/'(?:\\.|[^'\\])'/g, (m) => `<span class="token string">${m}<\/span>`);
      // Numbers
      s = s.replace(/\b(0x[\da-fA-F]+|\d+\.?\d*[fFlL]?|\.\d+)\b/g, '<span class="token number">$1<\/span>');
      // Keywords
      s = s.replace(/\b(alignas|alignof|and|and_eq|asm|auto|bitand|bitor|bool|break|case|catch|char|char8_t|char16_t|char32_t|class|compl|concept|const|consteval|constexpr|constinit|const_cast|continue|co_await|co_return|co_yield|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|not|not_eq|nullptr|operator|or|or_eq|private|protected|public|register|reinterpret_cast|requires|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while|xor|xor_eq)\b/g, '<span class="token keyword">$1<\/span>');
      // Functions
      s = s.replace(/\b([a-zA-Z_][\w]*)\s*(?=\()/g, '<span class="token function">$1<\/span>');
      return s;
    };

    const ruby = () => {
      let s = esc(code);
      // Comments
      s = s.replace(/(#[^\n]*)/gm, (m) => `<span class="token comment">${m}<\/span>`);
      // Strings (single, double, and symbols)
      s = s.replace(/"(?:\\.|[^"\\])*"/g, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/'(?:\\.|[^'\\])*'/g, (m) => `<span class="token string">${m}<\/span>`);
      s = s.replace(/:[a-zA-Z_][\w]*/g, (m) => `<span class="token property">${m}<\/span>`);
      // Numbers
      s = s.replace(/\b(\d+\.?\d*|\.\d+)\b/g, '<span class="token number">$1<\/span>');
      // Keywords
      s = s.replace(/\b(__ENCODING__|__LINE__|__FILE__|BEGIN|END|alias|and|begin|break|case|class|def|defined\?|do|else|elsif|end|ensure|false|for|if|in|module|next|nil|not|or|redo|rescue|retry|return|self|super|then|true|undef|unless|until|when|while|yield)\b/g, '<span class="token keyword">$1<\/span>');
      // Instance variables
      s = s.replace(/@[a-zA-Z_][\w]*/g, '<span class="token variable">$&<\/span>');
      // Functions
      s = s.replace(/\b([a-zA-Z_][\w]*[?!]?)\s*(?=\()/g, '<span class="token function">$1<\/span>');
      return s;
    };

    const html = () => {
      let s = esc(code);
      // Comments
      s = s.replace(/&lt;!--[\s\S]*?--&gt;/g, (m) => `<span class="token comment">${m}<\/span>`);
      // Doctype
      s = s.replace(/&lt;!DOCTYPE[^&]*&gt;/gi, (m) => `<span class="token keyword">${m}<\/span>`);
      // Tags
      s = s.replace(/&lt;\/?([a-zA-Z][\w-]*)/g, (m, tagName) => `&lt;<span class="token keyword">${tagName}<\/span>`);
      // Attributes
      s = s.replace(/\b([a-zA-Z][\w-]*)\s*=/g, '<span class="token property">$1<\/span>=');
      // Attribute values
      s = s.replace(/=\s*"[^"]*"/g, (m) => {
        const value = m.substring(m.indexOf('"'));
        return `=<span class="token string">${esc(value)}<\/span>`;
      });
      s = s.replace(/=\s*'[^']*'/g, (m) => {
        const value = m.substring(m.indexOf("'"));
        return `=<span class="token string">${esc(value)}<\/span>`;
      });
      return s;
    };

    const css = () => {
      let s = esc(code);
      // Comments
      s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="token comment">${m}<\/span>`);
      // Selectors (simple approach)
      s = s.replace(/^([.#]?[a-zA-Z][\w-]*|\*|&gt;|\+|~)\s*\{/gm, (m, sel) => `<span class="token keyword">${sel}<\/span> {`);
      // Properties
      s = s.replace(/\b([a-zA-Z-]+)\s*:/g, '<span class="token property">$1<\/span>:');
      // Values with units
      s = s.replace(/:\s*([#][\da-fA-F]{3,8})/g, ': <span class="token string">$1<\/span>');
      s = s.replace(/\b(\d+\.?\d*)(px|em|rem|%|vh|vw|pt|cm|mm|in|deg|s|ms)?\b/g, '<span class="token number">$1$2<\/span>');
      // Important
      s = s.replace(/!important\b/g, '<span class="token keyword">!important<\/span>');
      return s;
    };

    const csharp = () => {
      let s = esc(code);
      
      // Use placeholders to prevent regex interference
      const PLACEHOLDER_PREFIX = '\x00THINKR';
      const PLACEHOLDER_SUFFIX = 'THINKR\x00';
      const placeholders = [];
      
      const createPlaceholder = (html) => {
        const id = placeholders.length;
        placeholders.push(html);
        return `${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`;
      };
      
      // Comments (including XML documentation comments ///)
      // Process /// first, then //, then /* */
      s = s.replace(/(\/\/\/[^\n]*)/gm, (m) => createPlaceholder(`<span class="token comment">${m}<\/span>`));
      s = s.replace(/(\/\/[^\n]*)/gm, (m) => createPlaceholder(`<span class="token comment">${m}<\/span>`));
      s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => createPlaceholder(`<span class="token comment">${m}<\/span>`));
      
      // Strings (including verbatim strings @"..." and interpolated strings $"...")
      s = s.replace(/@"(?:""|[^"])*"/g, (m) => createPlaceholder(`<span class="token string">${m}<\/span>`));
      s = s.replace(/\$@"(?:""|[^"])*"/g, (m) => createPlaceholder(`<span class="token string">${m}<\/span>`));
      s = s.replace(/\$"(?:\\.|[^"\\])*"/g, (m) => createPlaceholder(`<span class="token string">${m}<\/span>`));
      s = s.replace(/"(?:\\.|[^"\\])*"/g, (m) => createPlaceholder(`<span class="token string">${m}<\/span>`));
      s = s.replace(/'(?:\\.|[^'\\])'/g, (m) => createPlaceholder(`<span class="token string">${m}<\/span>`));
      
      // Numbers
      s = s.replace(/\b(0x[\da-fA-F]+|\d+\.?\d*[fFdDmMuUlL]*|\.\d+)\b/g, (m) => 
        createPlaceholder(`<span class="token number">${m}<\/span>`)
      );
      
      // Keywords (including C# specific ones like async, await, var, dynamic, etc.)
      s = s.replace(/\b(abstract|add|alias|as|ascending|async|await|base|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|descending|do|double|dynamic|else|enum|event|explicit|extern|false|finally|fixed|float|for|foreach|from|get|global|goto|if|implicit|in|int|interface|internal|is|join|let|lock|long|namespace|new|null|object|operator|orderby|out|override|params|partial|private|protected|public|readonly|record|ref|remove|return|sbyte|sealed|select|set|short|sizeof|stackalloc|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|value|var|virtual|void|volatile|where|while|yield)\b/g, (m) => 
        createPlaceholder(`<span class="token keyword">${m}<\/span>`)
      );
      
      // Attributes
      s = s.replace(/\[([a-zA-Z_][\w]*)\]/g, (match, attrName) => 
        '[' + createPlaceholder(`<span class="token property">${attrName}<\/span>`) + ']'
      );
      
      // Functions
      s = s.replace(/\b([a-zA-Z_][\w]*)\s*(?=\()/g, (match, funcName) => {
        const keywords = ['abstract', 'add', 'alias', 'as', 'ascending', 'async', 'await', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'descending', 'do', 'double', 'dynamic', 'else', 'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'from', 'get', 'global', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'join', 'let', 'lock', 'long', 'namespace', 'new', 'null', 'object', 'operator', 'orderby', 'out', 'override', 'params', 'partial', 'private', 'protected', 'public', 'readonly', 'record', 'ref', 'remove', 'return', 'sbyte', 'sealed', 'select', 'set', 'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using', 'value', 'var', 'virtual', 'void', 'volatile', 'where', 'while', 'yield'];
        if (keywords.includes(funcName.toLowerCase())) return match;
        return createPlaceholder(`<span class="token function">${funcName}<\/span>`) + match.substring(funcName.length);
      });
      
      // Restore all placeholders
      placeholders.forEach((html, id) => {
        s = s.replace(new RegExp(`${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`, 'g'), html);
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
      case 'go':
      case 'golang':
        return go();
      case 'rust':
      case 'rs':
        return rust();
      case 'java':
        return java();
      case 'kotlin':
      case 'kt':
        return kotlin();
      case 'c':
      case 'cpp':
      case 'c++':
      case 'cxx':
        return cpp();
      case 'ruby':
      case 'rb':
        return ruby();
      case 'html':
      case 'htm':
        return html();
      case 'css':
      case 'scss':
      case 'sass':
        return css();
      case 'csharp':
      case 'cs':
      case 'c#':
      case 'dotnet':
        return csharp();
      default:
        return esc(code);
    }
  };

  codeBlocks.forEach((el) => {
    // Skip if already highlighted
    if (el.querySelector('.token') || el.innerHTML.includes('class="token')) {
      return;
    }
    
    const classList = el.className || '';
    const match = classList.match(/language-([\w-]+)/);
    const lang = match ? match[1].toLowerCase() : 'plaintext';
    const original = el.textContent || '';
    
    // Only highlight if we have actual code
    if (!original || original.trim() === '') {
      return;
    }
    
    try {
      const highlighted = highlight(original, lang);
      
      
      // Verify the highlighted HTML is valid before setting
      // Check that it contains proper span tags (not just orphaned attributes)
      if (highlighted && highlighted.includes('<span class="token')) {
        el.innerHTML = highlighted;
      } else if (!highlighted.includes('class="token')) {
        // If no tokens, just use the escaped version
        el.innerHTML = highlight(original, 'plaintext');
      }
    } catch (error) {
      // Fallback to plain escaped text if highlighting fails
      el.textContent = original;
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
    
    // Extract the code text
    const codeText = codeEl.textContent || '';
    
    // Extract the language from the code element's class
    const classList = codeEl.className || '';
    const langMatch = classList.match(/language-([\w-]+)/);
    const language = langMatch ? langMatch[1] : '';
    
    // Format as markdown code block
    let formattedText;
    if (language && language !== 'text' && language !== 'plaintext') {
      formattedText = '```' + language + '\n' + codeText + '\n```';
    } else {
      formattedText = '```\n' + codeText + '\n```';
    }
    
    try {
      navigator.clipboard.writeText(formattedText);
      const original = btn.textContent;
      btn.textContent = 'Copied';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1200);
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = formattedText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  });
}



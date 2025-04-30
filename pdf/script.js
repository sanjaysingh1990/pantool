// script.js
let uploadedFiles = [];

document.getElementById('pdfInput').addEventListener('change', function(e) {
    // Append new files instead of replacing
    const newFiles = Array.from(e.target.files);
    uploadedFiles = [...uploadedFiles, ...newFiles];
    updateFileList();
});

function updateFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = uploadedFiles.map((file, index) => `
        <div class="file-item">
            ${file.name} (${(file.size/1024).toFixed(2)} KB)
            <button onclick="removeFile(${index})">×</button>
        </div>
    `).join('');
}

function removeFile(index) {
    uploadedFiles = uploadedFiles.filter((_, i) => i !== index);
    updateFileList();
}

// Update script.js with these functions
let currentPDFDoc = null;

function formatText(command, value = null) {
    document.execCommand(command, false, value);
    document.getElementById('editor').focus();
}

async function createPDF() {
    try {
        const pdfDoc = await PDFLib.PDFDocument.create();
        const page = pdfDoc.addPage([612, 792]); // Letter size

        // Get rich text content with formatting
        const editor = document.getElementById('editor');
        const styledContent = parseRichText(editor.innerHTML);

        // Draw formatted content
        await drawStyledText(page, styledContent);

        const pdfBytes = await pdfDoc.save();
        savePDF(pdfBytes, 'rich-document.pdf');
    } catch (error) {
        alert('Error creating PDF: ' + error.message);
    }
}

function parseRichText(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return extractStyles(doc.body);
}

function extractStyles(node) {
    const result = [];

    node.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
            result.push({
                text: child.textContent.replace(/\n/g, ' '), // Cleanup text nodes
                styles: getCurrentStyles(child.parentElement)
            });
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            // Add line breaks for block elements
            if (['DIV', 'P', 'BR'].includes(child.tagName)) {
                result.push({
                    text: '\n',
                    styles: getCurrentStyles(child)
                });
            }
            result.push(...extractStyles(child));
        }
    });

    return result;
}

function getCurrentStyles(element) {
    const styles = {
        bold: element.tagName === 'STRONG' || element.style.fontWeight === 'bold',
        italic: element.tagName === 'EM' || element.style.fontStyle === 'italic',
        underline: element.style.textDecoration === 'underline',
        color: element.style.color || '#000000',
        fontSize: parseInt(element.style.fontSize) || 12,
        fontFamily: element.style.fontFamily || 'Helvetica',
        alignment: element.style.textAlign || 'left'
    };

    // Check computed styles for inherited properties
    const computed = window.getComputedStyle(element);
    if (!styles.color) styles.color = computed.color;
    if (!styles.fontSize) styles.fontSize = parseInt(computed.fontSize);
    if (!styles.fontFamily) styles.fontFamily = computed.fontFamily;

    return styles;
}

async function drawStyledText(page, content) {
    let y = 750; // Start position
    const lineHeight = 14;
    const maxWidth = 500;
    const marginLeft = 50;

    for (const segment of content) {
        const text = segment.text;
        const styles = segment.styles;
        const font = await page.doc.embedFont(styles.fontFamily);

        // First split by manual newlines
        const manualLines = text.split('\n');

        for (const manualLine of manualLines) {
            // Then handle word wrapping
            const words = manualLine.split(' ');
            let currentLine = '';

            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const testWidth = font.widthOfTextAtSize(testLine, styles.fontSize);

                if (testWidth > maxWidth) {
                    if (currentLine) {
                        await drawLine(currentLine, font, styles, page, marginLeft, y);
                        y -= styles.fontSize + lineHeight;
                    }
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }

            if (currentLine) {
                await drawLine(currentLine, font, styles, page, marginLeft, y);
                y -= styles.fontSize + lineHeight;
            }
        }
    }
}

async function drawLine(text, font, styles, page, x, y) {
    // Handle page overflow
    if (y < 100) {
        page = page.doc.addPage([612, 792]);
        y = 750;
    }

    // Remove any remaining special characters
    const cleanText = text.replace(/[\n\r]/g, ' ');

    page.drawText(cleanText, {
        x,
        y,
        size: styles.fontSize,
        font,
        color: PDFLib.rgb(...hexToRgb(styles.color)),
        underline: styles.underline
    });
}

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    const bigint = parseInt(hex, 16);
    return [
        (bigint >> 16) & 255,
        (bigint >> 8) & 255,
        bigint & 255
    ].map(c => c / 255);
}

async function mergePDFs() {
    if (uploadedFiles.length < 2) {
        alert('Please upload at least 2 PDF files to merge');
        return;
    }

    try {
        const mergedPdf = await PDFLib.PDFDocument.create();

        // Create an array of promises to process all files
        const processingPromises = uploadedFiles.map(async(file) => {
            const arrayBuffer = await file.arrayBuffer();
            return PDFLib.PDFDocument.load(arrayBuffer);
        });

        // Wait for all files to load
        const pdfDocuments = await Promise.all(processingPromises);

        // Merge pages
        for (const pdfDoc of pdfDocuments) {
            const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }

        const pdfBytes = await mergedPdf.save();
        savePDF(pdfBytes, 'merged-document.pdf');
    } catch (error) {
        alert('Error merging PDFs: ' + error.message);
    }
}

async function splitPDF() {
    if (uploadedFiles.length !== 1) {
        alert('Please upload exactly 1 PDF file to split');
        return;
    }

    try {
        const pageRange = document.getElementById('pageRange').value;
        const file = uploadedFiles[0];
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        const totalPages = pdfDoc.getPageCount();

        const pagesToSplit = parsePageRange(pageRange, totalPages);

        for (const pageNum of pagesToSplit) {
            const newPdf = await PDFLib.PDFDocument.create();
            const [page] = await newPdf.copyPages(pdfDoc, [pageNum - 1]);
            newPdf.addPage(page);
            const pdfBytes = await newPdf.save();
            savePDF(pdfBytes, `page-${pageNum}.pdf`);
        }
    } catch (error) {
        alert('Error splitting PDF: ' + error.message);
    }
}

function parsePageRange(range, maxPages) {
    if (!range) return Array.from({ length: maxPages }, (_, i) => i + 1);

    const pages = new Set();
    const parts = range.split(',');

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            for (let i = start; i <= (end || maxPages); i++) {
                if (i > 0 && i <= maxPages) pages.add(i);
            }
        } else {
            const num = Number(part);
            if (num > 0 && num <= maxPages) pages.add(num);
        }
    }

    return Array.from(pages).sort((a, b) => a - b);
}

async function rotatePDF(degrees) {
    if (uploadedFiles.length !== 1) {
        alert('Please upload exactly 1 PDF file to rotate');
        return;
    }

    try {
        const file = uploadedFiles[0];
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);

        const pages = pdfDoc.getPages();
        pages.forEach(page => {
            page.setRotation((page.getRotation().angle + degrees) % 360);
        });

        const pdfBytes = await pdfDoc.save();
        savePDF(pdfBytes, `rotated-${file.name}`);
    } catch (error) {
        alert('Error rotating PDF: ' + error.message);
    }
}

async function addWatermark() {
    if (uploadedFiles.length !== 1) {
        alert('Please upload exactly 1 PDF file to watermark');
        return;
    }

    try {
        const text = document.getElementById('watermarkText').value;
        const file = uploadedFiles[0];
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);

        const pages = pdfDoc.getPages();
        pages.forEach(page => {
            const { width, height } = page.getSize();
            page.drawText(text, {
                x: width / 2 - 50,
                y: height / 2,
                size: 24,
                color: PDFLib.rgb(0.5, 0.5, 0.5),
                opacity: 0.3
            });
        });

        const pdfBytes = await pdfDoc.save();
        savePDF(pdfBytes, `watermarked-${file.name}`);
    } catch (error) {
        alert('Error adding watermark: ' + error.message);
    }
}

async function passwordProtect() {
    if (uploadedFiles.length !== 1) {
        alert('Please upload exactly 1 PDF file to protect');
        return;
    }

    try {
        const password = document.getElementById('pdfPassword').value;
        const file = uploadedFiles[0];
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);

        // Requires pdf-lib-encrypt extension
        const encryptOptions = {
            userPassword: password,
            ownerPassword: password,
            permissions: {
                printing: 'allowAll',
                modifying: false,
                copying: false
            }
        };

        const pdfBytes = await pdfDoc.save(encryptOptions);
        savePDF(pdfBytes, `protected-${file.name}`);
    } catch (error) {
        alert('Error password protecting PDF: ' + error.message);
    }
}

function savePDF(pdfBytes, fileName) {

    // Update metadata if provided
    if (document.getElementById('docTitle').value || document.getElementById('docAuthor').value) {
        const metadata = {
            title: document.getElementById('docTitle').value,
            author: document.getElementById('docAuthor').value
        };
        // Add metadata update logic here (requires more advanced handling)
    }

    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    saveAs(blob, fileName);

    // Show preview
    const url = URL.createObjectURL(blob);
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <a href="${url}" download="${fileName}">Download ${fileName}</a>
        <iframe src="${url}"></iframe>
    `;
}
// ==UserScript==
// @name        For www.as-books.jp
// @namespace   Violentmonkey Scripts
// @match       https://www.as-books.jp/trhtml5_ssl/view/*
// @match       https://lib.as-books.jp/html5_ssl/view/*
// @grant       none
// @version     1.0
// @author      -
// @description 14.05.2024, 16:29:48
// @noframes
// @run-at      document-idle
// ==/UserScript==

const bookState = {
    baseHref: '',
    baseFileHref: '',
    iframe: null,
    printButtonEl: null,
    total: 0,
    imagesFolder: '/books/images/2',
}

const getPrintButtonText = () =>
    `Печать: ${bookState.total} стр.`

function addPrintStyleInDoc(document) {
    const printStyles = `
    @media print {
      @page {
        size: auto;
        margin: 0mm;
      }
    
      body {
        margin: 0;
        padding: 0;
      }
    
      img {
        display: block;
      }
    }
`

    const printStyleEl = document.createElement('style')
    printStyleEl.innerHTML = printStyles;
    document.body.appendChild(printStyleEl)
}

async function addImagesInDoc(document) {
    const imageWrapperEl = document.createElement('div')

    const imagePaths =
        [...new Array(bookState.total)].map((_, index) => `${bookState.baseFileHref}${bookState.imagesFolder}/${index + 1}.jpg`)

    await Promise.all(imagePaths.map((path) =>
        new Promise((resolve, reject) => {
            const img = new Image();
            imageWrapperEl.appendChild(img)
            img.onload = function () {
                resolve(path);
            };
            img.onerror = function () {
                reject(path);
            };
            img.src = path;
        })
    )).then(function (images) {
        console.log("Все изображения успешно загружены.");
    }).catch(function (error) {
        console.error("Ошибка загрузки изображений:", error);
    });

    document.body.appendChild(imageWrapperEl)
}

window.App = new Proxy(window.App, {
    set(_, prop, book) {
        if (prop === 'book' && book?.lastPage) {
            initBookPrinter(book)
        }

        return Reflect.set(...arguments)
    }
});

// Создаем bookState.iframe и добавляем сгенерированное содержимое к нему
function createIframe(onAppend) {
    if (bookState.iframe) {
        onAppend(true)
        return
    }

    bookState.iframe = document.createElement('iframe');
    bookState.iframe.src = 'about:blank'; // Загружаем пустую страницу
    bookState.iframe.hidden = true;
    bookState.iframe.onload = async () => {
        const iframeDoc = bookState.iframe.contentWindow.document;

        await addImagesInDoc(iframeDoc)
        addPrintStyleInDoc(iframeDoc)

        onAppend(true)
    };

    bookState.iframe.onerror = (e) => {
        onAppend(false);
        console.error(e);
    }

    document.body.appendChild(bookState.iframe);
}

async function handlePrint() {
    bookState.printButtonEl.textContent = 'Загрузка...'

    createIframe((status) => {
        bookState.printButtonEl.textContent = getPrintButtonText()
        status && bookState.iframe.contentWindow.print()
    })
}


function getPrintButton() {
    const button = document.createElement("button");
    button.textContent = getPrintButtonText()

    Object.assign(button.style, {
        position: 'absolute',
        zIndex: 100,
        top: '20px',
        right: '20px',
        padding: "10px 20px",
        backgroundColor: "#007bff",
        color: "#fff",
        width: '200px',
        border: "none",
        borderRadius: "5px",
        cursor: "pointer",
        fontSize: "16px",
        boxShadow: '0 1px 3px 1px rgba(0, 0, 0, .3)'
    });

    button.onclick = () => {
        handlePrint()
    }

    return button
}

async function initBookPrinter(book) {
    bookState.baseHref = document.querySelector('base')?.href?.replace('/HTML5/', '');

    if (!bookState.baseHref) return

    // fix url for free book
    bookState.baseFileHref = bookState.baseHref.replace('/trbook_html_ssl/', '/trfileread_html_ssl/read.php?f=')

    // const xml = await fetch(bookState.baseHref + '/iPhone/ibook.xml').then(res => res.text())
    // const total = Number(xml?.match(/<total>(.*?)<\/total>/i)?.[1]) || null
    bookState.total = book?.lastPage || 0;

    // console.log(`Найдено страниц: ${bookState.total}`);

    if (!bookState.total) return

    bookState.printButtonEl = getPrintButton()
    document.body.appendChild(bookState.printButtonEl);
}


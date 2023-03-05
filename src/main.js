var CryptoJS = require("crypto-js");
var config = require('./config.js');
var utils = require('./utils.js');

function supportLanguages() {
    return config.supportedLanguages.map(([standardLang]) => standardLang);
}

function getFilePath(fileName) {
    return `$sandbox/${fileName}`;
}

function readFile(fileName) {
    const filePath = getFilePath(fileName);

    const exists = $file.exists(filePath);

    if (!exists) {
        return ''
    }
    return $file.read(filePath).toUTF8()
}

function writeFile(value, fileName) {
    $file.write({
        data: $data.fromUTF8(value),
        path: getFilePath(fileName),
    });
}

function deleteFile(fileName = historyFileName) {
    $file.delete(getFilePath(fileName));
}

function encrypto(t) {
    const n = '95bae0e3871c9834'
    const key = CryptoJS.enc.Utf8.parse(n)
    const encrypted = CryptoJS.AES.encrypt(t, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
    });
    let result = encrypted.toString().replace(/\//g, '_')
    result = result.replace(/\+/g, '-')
    return result
}

function translate(query, completion) {
    (async () => {
        const targetLanguage = utils.langMap.get(query.detectTo);
        const sourceLanguage = utils.langMap.get(query.detectFrom);
        if (!targetLanguage) {
            const err = new Error();
            Object.assign(err, {
                _type: 'unsupportLanguage',
                _message: '不支持该语种',
            });
            throw err;
        }

        const source_lang = sourceLanguage || 'ZH';
        const target_lang = targetLanguage || 'EN';
        const translate_text = query.text || '';
        if (translate_text !== '') {
            const encryptedText = encrypto(translate_text)
            const loginUrl = 'https://dict.cnki.net/fyzs-front-api/getToken';
            const url = 'https://dict.cnki.net/fyzs-front-api/translate/literalTranslation';
            const header = {
                'Content-Type': 'application/json;charset=UTF-8',
                "Referer": "https://dict.cnki.net/index",
                "Origin": "https://dict.cnki.net",
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                "Token": ""
            }
            try {
                // 先读取缓存token 如果没有token则获取token
                let token = readFile('token.txt')
                if (token) {
                    header.Token = token
                }
                if (!header.Token) {
                    // 获取token
                    const tokenResp = await $http.request({
                        method: "GET",
                        url: loginUrl,
                        header: {
                            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                        }
                    });
                    if (tokenResp.data && tokenResp.data.code === 200) {
                        header.Token = tokenResp.data.data
                        // 写入缓存
                        writeFile(tokenResp.data.data, 'token.txt')
                    } else {
                        const errMsg = tokenResp.data ? '获取token异常==>' + JSON.stringify(tokenResp.data) : '未知错误'
                        completion({
                            error: {
                                type: 'unknown',
                                message: errMsg,
                                addtion: errMsg,
                            },
                        });
                    }
                }
                // 翻译请求
                const resp = await $http.request({
                    method: "POST",
                    url: url,
                    header: header,
                    body: {"words": encryptedText, "translateType": null}
                });
                if (resp.data && resp.data.data && resp.data.data.mResult) {
                    completion({
                        result: {
                            from: utils.langMapReverse.get(source_lang),
                            to: utils.langMapReverse.get(target_lang),
                            toParagraphs: resp.data.data.mResult.split('\n'),
                        },
                    });
                } else {
                    if (resp.data && resp.data.code === 401) {
                        // token失效
                        deleteFile('token.txt')
                    }
                    const errMsg = '翻译异常请求header==>' + JSON.stringify(header) + '翻译异常请求body参数==>' + JSON.stringify({
                        "words": encryptedText,
                        "translateType": null
                    }) + (resp.data ? '翻译异常==>' + JSON.stringify(resp.data) : '未知错误')
                    completion({
                        error: {
                            type: 'unknown',
                            message: errMsg,
                            addtion: errMsg,
                        },
                    });
                }
            } catch (e) {
                Object.assign(e, {
                    _type: 'network',
                    _message: '接口请求错误 - ' + JSON.stringify(e),
                });
                throw e;
            }
        }
    })().catch((err) => {
        $log.error(err)
        completion({
            error: {
                type: err._type || 'unknown',
                message: err._message || '未知错误',
                addtion: err._addtion,
            },
        });
    });
}

exports.supportLanguages = supportLanguages;
exports.translate = translate;

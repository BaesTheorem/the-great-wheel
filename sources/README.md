# sources/

Put sourcebook scans and their OCR text here. Git ignores everything in this folder except this file, so the books never go into the repo.

The Realmspace data came from a scan of *Realmspace* (TSR 9312, 1991). To make it again:

```sh
ocrmypdf --skip-text realmspace-scan.pdf realmspace-ocr.pdf
pdftotext -layout realmspace-ocr.pdf realmspace.txt
```

PDF page N of that scan is book page N - 1.

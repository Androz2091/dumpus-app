// CloudFront runs this on each request to web.dumpus.app, before its cache.
// The static export saves each page as `<page>/index.html`, and S3 only finds
// a file by its full name, so `/overview/` needs `index.html` added.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var name = uri.slice(uri.lastIndexOf("/") + 1);
  if (name === "") {
    request.uri = uri + "index.html";
  } else if (name.indexOf(".") === -1) {
    // A page typed without the trailing slash the app's links have.
    request.uri = uri + "/index.html";
  }
  return request;
}

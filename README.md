# Tadpoles Scraper

A Node.js tool to batch download images and video from the [Tadpoles](https://www.tadpoles.com) app.

The Tadpoles website and app has several deficiencies which this tries to address:

  - No bulk download functionality
  - Media does not contain EXIF or metadata information on when it was taken

### Supported formats

  - PNG
  - JPEG
  - MP4

Any other file types will be ignored.

### Config

There is an included `config.json` file which needs to be modified for use.

| Config Name | Description |
| ------ | ------ |
| username | your Tadpoles account username |
| password | your Tadpoles account password |
| login_type | type of login ***only email is supported** |
| image_path | local path to store the media (relative allowed) |
| file_pattern | pattern for downloaded media |

Valid replacement values for `image_path`

| Value | Description |
| ------ | ------ |
| %%child%% | The name of the child the media is associated with |
| %%YYYY%% | The 4 digit year the media was created |
| %%MM%% | The 2 digit month the media was created |
| %%DD%% | The 2 digit day the media was created |

Valid replacement values for `file_pattern`

| Value | Description |
| ------ | ------ |
| %%child%% | The name of the child the media is associated with |
| %%YYYY%% | The 4 digit year the media was created |
| %%MM%% | The 2 digit month the media was created |
| %%DD%% | The 2 digit day the media was created |
| %%imgkey%% | the unique image key assigned by Tadpoles (long) |
| %%keymd5%% | Shortened MD5 summary of the Tadpoles image key |

### Usage
Requires [Node.js](https://nodejs.org/) v4+ as well as Python 2.7.x (3.x not supported).  On Windows, VCBuild.exe will be required.  If this is already installed and in the system path, you should be good.  Otherwise, you can install the necessary files via npm in an administrative command prompt with
```
npm install -g windows-build-tools
```

Install the dependencies
```sh
npm install -d
```

Run the scraper
```sh
node index.js
```

License
----

MIT

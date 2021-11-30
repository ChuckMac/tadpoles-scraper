const mkdirp = require('mkdirp')
const fs = require('graceful-fs')
const retry = require('async-retry')

const axios = require('axios')
const qs = require('query-string')
const axiosCookieJarSupport = require('axios-cookiejar-support').default
const tough = require('tough-cookie')

const crypto = require('crypto')
const imghdr = require('imghdr')
const piexif = require('piexifjs')
const utimes = require('utimes');

const extract = require('png-chunks-extract')
const encode = require('png-chunks-encode')
const text = require('png-chunk-text')

/**
 * Initialize vars used to track event pagination
 */
var lastitem
var finalitem
var iterations = []

/**
 * Load the json config file
 */
const config = require('./config.json')

/**
 * Create our http client with Axios (with cookies)
 */
axiosCookieJarSupport(axios)
const cookieJar = new tough.CookieJar()

const client = axios.create({
	baseURL: 'https://www.tadpoles.com',
	jar: cookieJar,
	withCredentials: true
})

/**
 * Authenticate our session with Tadpoles
 * @constructor
 * @returns {object} http response from the login call 
 */
async function authenticate() {
	console.log('  -- Authenticating ' + config.username)
	parms = {
		email: config.username,
		password: config.password,
		server: 'tadpoles'
	}

	try {
		return await client.post('/auth/login', qs.stringify(parms))
	} catch (error) {
		console.log('Authentication Error')
		process.exit(1)
	}	
}

/**
 * Admit our session to Tadpoles (required after Authentication)
 * @constructor
 * @returns {object} http response from the auth call 
 */
async function admit() {
	console.log('  -- Admitting')
	parms = {
		state: 'client',
		os_name: 'iphone',
		app_version: '8.8.7',
		ostype: '64bit',
		tz: 'America New_York',
		battery_level: '-1',
		locale: 'en-US',
		available_memory: '62.65625',
		platform_version: '11.4.1',
		logged_in: '0',
		uses_dst: '1',
		utc_offset: '-05:00',
		model: 'iPhone9,1',
		v: '2'
	}

	try {
		return await client.post('/remote/v1/athome/admit', qs.stringify(parms))
	} catch (error) {
		console.log('Admission Error')
		console.log(error)
		process.exit(1)
	}	
}

/**
 * Get the overview information from Tadpoles we need for pagination calls
 *   - latest event date
 *   - first event date
 * @constructor
 * @returns {object} http response from the parameters call 
 */
async function get_overview() {
	console.log('  -- Getting overview information')
	parms = {
		'include_all_kids': 'true',
		'include_guardians': 'false'
	}

	try {
		return await client.get('/remote/v1/parameters?' + qs.stringify(parms))
	} catch (error) {
		console.log('Error retreiving list')
		console.log(error)
		process.exit(1)
	}	
}

/**
 * Get a list of events from Tadpoles. This can include pictures and announcements.
 * @constructor
 * @param {string} lastdate the epoch date to start retreiving events from
 * @returns {object} http response from the events call 
 */
async function get_events(lastdate) {
	console.log('  -- Getting listings from ' + lastdate)
	iterations.push(lastdate)
	parms = {
		'state': 'client',
		'num_events': '78',
		'direction': 'range',
		'latest_event_time': lastdate,
		'earliest_event_time': finalitem
	}

	try {
		return await client.get('remote/v1/events?' + qs.stringify(parms))
	} catch (error) {
		console.log('Error retreiving events')
		console.log(error)
		process.exit(1)
	}	
}

/**
 * Maybe download an image from Tadpoles
 *  - Make replacements in the path + filename from the config file
 *  - Check if the file already exists on the system
 *  - Only save images with specific content-type (jpg/png/mp4)
 * @constructor
 * @param {string} imgkey the key of the attachment on the Tadpoles server
 * @param {object} event the event information
 * @returns {string} filename the filename of the downloaded object [false if not downloaded]
 */
async function maybe_download_attachment(imgkey, event) {
	date = event.event_date.split('-')
	imghash = crypto.createHash('md5').update(imgkey).digest('hex')
	imgurl = '/remote/v1/attachment?key=' + imgkey
  
	var dirbase = config.image_path
	dirbase = dirbase.split('%child%').join(event.parent_member_display)
	dirbase = dirbase.split('%YYYY%').join(date[0])
	dirbase = dirbase.split('%MM%').join(date[1])
	dirbase = dirbase.split('%DD%').join(date[2])

	var filebase = config.file_pattern
	filebase = filebase.split('%child%').join(event.parent_member_display)
	filebase = filebase.split('%YYYY%').join(date[0])
	filebase = filebase.split('%MM%').join(date[1])
	filebase = filebase.split('%DD%').join(date[2])
	filebase = filebase.split('%keymd5%').join(imghash)
	filebase = filebase.split('%imgkey%').join(imgkey)

	filename = false
	
	if (! fs.existsSync(dirbase + filebase + '.jpg' ) && ! fs.existsSync(dirbase + filebase + '.png' ) && ! fs.existsSync(dirbase + filebase + '.mp4' ) && ! fs.existsSync(dirbase + filebase + '.pdf' )) {
		console.log('    -- File ' + filebase + ' from ' + event.event_date + ' does not exist... downloading')
		await mkdirp( dirbase, function(err) {
			if (err != null) {
				console.error('error calling mkdirp on path: ', dirbase, '\n\ndetails: ', err)
			}
		});
		// save comment to file if it exists
		var comment = event.comment;
		if (comment !== undefined && comment !== null && comment !== '') {
			var commentFileLocation = dirbase + filebase + '.txt'
			fs.writeFileSync(commentFileLocation, comment)
		}
		// download file
		try {
			await client.get(imgurl, {
				responseType: 'arraybuffer',
				headers: {
				  'Accept': '*/*'
				}
			}).then(function (response) {
				if (response.headers['content-type'] == 'image/jpeg') {
					filename = dirbase + filebase + '.jpg'
					fs.writeFileSync(filename, response.data)
				} else if (response.headers['content-type'] == 'image/png') {
					filename = dirbase + filebase + '.png'
					fs.writeFileSync(filename, response.data)
				} else if (response.headers['content-type'] == 'video/mp4') {
					filename = dirbase + filebase + '.mp4'
					fs.writeFileSync(filename, response.data)
				} else if (response.headers['content-type'] == 'application/pdf') {
					filename = dirbase + filebase + '.pdf'
					fs.writeFileSync(filename, response.data)
				} else {
					console.log('      -- content-type ' + response.headers['content-type'] + ' excluded - skipping' )
				}
			})
			return filename
		} catch (error) {
			console.log('Error downloading file for ' + event.parent_member_display + ': ' + imgkey + ' on ' + event.event_date)
			console.log(error)
		}
	} else {
		return false
	}
}

/**
 * Tadpoles likes to mislabel png files as jpg.  
 * Check the image header for these type of images and change the extension if its wrong.
 * @constructor
 * @param {string} filename the name of the file to check
 * @returns {string} filename the filename output
 */
async function maybe_change_fileext(file) {

	var fileext = file.split('.').pop()

	if ( fileext == 'jpg' || fileext == 'png' ) {
		var exts = imghdr.what(file)
		if (exts.indexOf(fileext) === -1) {
			basename = file.replace(/\.[^/.]+$/, "")
			await retry(async bail => {
				return fs.renameSync(file, basename + '.' + exts[0])
			}, {
				retries: 5
			})
			file = basename + '.' + exts[0]
		}
	}

	return file

}

/**
 * Add exif / metadata for jpeg and png files.
 * Change the file dates to match the date the media was taken.
 *  
 * @constructor
 * @param {file} filename the name of the file
 * @returns {object} output of the writeFile
 */
async function maybe_update_image_data(file, event) {

	var fileext = file.split('.').pop()
	var event_date = new Date(event.event_time * 1000)

	if ( fileext == 'jpg' ) {
		formatted_date = event_date.getFullYear() + ':' + ("0" + (event_date.getMonth() + 1)).slice(-2) +  ':' + ("0" + (event_date.getDate())).slice(-2) + ' ' + ("0" + (event_date.getHours())).slice(-2) + ':'  + ("0" + (event_date.getMinutes())).slice(-2) + ':' + ("0" + (event_date.getSeconds())).slice(-2)

		var img = fs.readFileSync(file)
		var data = img.toString('binary')
		var exifObj = piexif.load(data)
		exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = formatted_date
		var exifbytes = piexif.dump(exifObj)
		var newData = piexif.insert(exifbytes, data)
		var newJpeg = new Buffer(newData, "binary")
		await retry(async bail => {
			return fs.writeFileSync(file, newJpeg)
		}, {
			retries: 5
		})
	}

	if ( fileext == 'png' ) {
		formatted_date = event_date.getFullYear() + ':' + ("0" + (event_date.getMonth() + 1)).slice(-2) +  ':' + ("0" + (event_date.getDate())).slice(-2) + ' ' + ("0" + (event_date.getHours())).slice(-2) + ':'  + ("0" + (event_date.getMinutes())).slice(-2) + ':' + ("0" + (event_date.getSeconds())).slice(-2)

		var img = fs.readFileSync(file)
		var chunks = extract(img)
		chunks.splice(-1, 0, text.encode('Creation Time', formatted_date))

		await retry(async bail => {
			return fs.writeFileSync(file, new Buffer(encode(chunks)))
		}, {
			retries: 5
		})
	}

	await utimes.utimes(file, event_date.getTime(), event_date.getTime(), event_date.getTime(), function(){})

}

async function main () {
	console.log('Starting Tadpoles Scraper...')
	auth = await authenticate()
	admit = await admit()
	info = await get_overview()
	finalitem = info.data.first_event_time
	lastitem = info.data.last_event_time + 1000

	while ( finalitem != lastitem ) {

		// We already iteratred over this so we are probably stuck in a loop
		if(iterations.indexOf(lastitem) != -1) {
			console.log('Ending loop')
			break
		}

		list = await get_events(lastitem)
		for (const event of list.data.events) {
			for (const imgkey of event.attachments){
				if( event.event_time < lastitem ) {
					lastitem = event.event_time
				}
				
				download = await maybe_download_attachment( imgkey, event )
				if(download){
					filename = await maybe_change_fileext(download) 
					await maybe_update_image_data(filename, event)
				}
			}
		}
	}
}

main().catch(err => {
	console.error('unexpected error', err)
	process.exit(2)
})
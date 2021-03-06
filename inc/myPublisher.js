exports.myPublisher = {
	debugOn: true,
	
	publish: function(data, opts){
		this._initVars(data, opts);
		this._loadTemplates();

		this.log.dbg('## REMOVE OVER DATA ##');
		this._removeOverData();
		this.log.dbg('##	DONE!');
		
		this.log.dbg('## processPackageInfo ##');
		this._processPackageInfo();
		this.log.dbg('##	DONE!');
		
		this.log.dbg('## _processLicense ##');
		this._processLicense();
		this.log.dbg('##	DONE!');
		
		this.log.dbg('## _processReadme ##');
		this._processReadme();
		this.log.dbg('##	DONE!');
		
		this.log.dbg('## _processData AND register Links ##');
		this._processData();
		this.log.dbg('##	DONE!');
		
		this.log.dbg('## _createOutDir ##');
		this._createOutDir();
		this.log.dbg('##	DONE!');
		
		this.log.dbg('## copying static files to output dir');
		this._copyStatic();
		this.log.dbg('##	DONE!');

		this.log.dbg('## orderData');
		this._orderData();
		this.log.dbg('##	DONE!');
		
		this.log.dbg('## buildSearchIndex');
		this._buildSearchIndex();
		this.log.dbg('##	DONE!');

		this.log.dbg('## genFilesPages');
		this._genFilesPages();
		this.log.dbg('##	DONE!');
		
		this.log.dbg('## Generate HTML Files');
		this._generateOUTPUT();
		this.log.dbg('##	DONE!');
	},
	
	_initVars: function(data, opts){
		this.data = data;
		this.opts = opts;
		
		this.info = {};
		this._templates = {};
		this.linktoNotFound = {};
		
		this._ = require('underscore/underscore');
		this.template = require('underscore/template');
		this.template.settings.evaluate    = /<\?js([\s\S]+?)\?>/g;
		this.template.settings.interpolate = /<\?js=([\s\S]+?)\?>/g;

		this.fs = require('fs');
		this.helper = require('./templateHelper');

		this.processFiles = require('./processFiles').processFiles;
		
		this.parseTags = require('./parseTags').parseTags;
		this.parseTags.init(this);
		this.tag2Parse = this.parseTags.getProccessableTags();
		
		this.scopeToPunc = { 
			'static': '.', 
			'inner': '~', 
			'instance': '#' 
		};
	},
	
	_loadTemplates: function(){
		
	},
	
	_removeOverData: function(){
		this.log.dbg('removing undocumented data');
		this.data.remove({
			undocumented: true
		});
		this.log.dbg('DONE!');
		
		this.log.dbg('removing ignored doclets');
		this.data.remove({
			ignore: true
		});
		this.log.dbg('DONE!');
		
		if(!this.opts['private']) { 
			this.log.dbg('removing private doclets');
			this.data.remove({
				access: 'private'
			}); 
			this.log.dbg('DONE!');
		}
    
		this.log.dbg('removing <anonymous> doclets');
		this.data.remove({
			memberof: '<anonymous>'
		});
		this.log.dbg('[debug] removed <anonymous> doclets');
	},
	
	_processPackageInfo: function(){
		this.packageInfo = (this.find({
			kind: 'package'
		}) || [])[0];

    
		// stores general info about the package
		if(!this.packageInfo.name) {
			for(var i = 0, n = this.opts['_'].length; i < n; ++i) {
				try {
					this.info['package'] = JSON.parse(
						this.fs.readFileSync(
							this.opts['_'][i] + '../package.json'
						)
					);

					break;
				} catch(e) {
					this.log.error('Cannot parse package.json: ' + e.message);
				}
			}
		}
	},
	
	_processLicense: function(){
		// try to fetch LICENSE
		for(var i = 0, n = this.opts['_'].length; i < n; ++i) {
			try {
				this.info.license = this.fs.readFileSync(this.opts['_'][i] + '../LICENSE');
				break;
			} catch(e) {}
		}
	},

	_processReadme: function(){
		// try to fetch README
		for(var i = 0, n = this.opts['_'].length; i < n; ++i) {
			try {
				this.info.readme = this.fs.readFileSync(this.opts['_'][i] + '../README');
				break;
			} catch(e) {}
		}
	},
	
	_processData: function(){
		var me = this;

		// Itero los doclets
		
		this.log.dbg('processData| Items a iterar: ', this.data.getLength());
		var step = Math.ceil(this.data.getLength() / 10);
		if(step > 50){step = 50;}

		this.data.forEach(function(doclet, ix){
			if((ix%step) === 0){
				me.log.dbg('processData| Iterados: ' + ix + '/' + me.data.getLength());
			}
			try{
			me._processDoclet(doclet);
			}catch(e){
				
				me.log._(e);
				return false;
				
			}
		});
	},
	
	_processDoclet: function(doclet){
		this._processDocletTags(doclet);
		
		if(!this.helper.longnameToUrl[doclet.longname]){
			var url = this.helper.createLink(doclet);
			this.helper.registerLink(doclet.longname, url);
		}else{
			var url = this.helper.longnameToUrl[doclet.longname];
		}

		if(url.indexOf('#') > -1) {
			doclet.id = this.helper.longnameToUrl[doclet.longname]
				.split(/#/).pop()
			;
		} else {
			doclet.id = doclet.name;
		}

		try{
			doclet = this.parseTags.onProccessDoclet(doclet);
		}catch(e){
			this.log.error('parseTag.onProccessDoclet con: ', doclet);
		}

		doclet.ancestors = this.generateAncestors(doclet);
		doclet.signature = this.generateSignature(doclet);

		return doclet;
	},
	
	_processDocletTags: function(doclet){
		var me = this,
			tagName, 
			method, 
			methodName, 
			i
		;

		// Itero la lista de tags a parsear y aplico el parseo 
		// correspondiente
		for(i = 0; i < this.tag2Parse.length; i++){
			tagName = this.tag2Parse[i];
			methodName = 'tag' + tagName.charAt(0).toUpperCase() + 
							tagName.substr(1)
			;
			method = this.parseTags[methodName];

			if(undefined !== doclet[tagName] && 
				undefined !== method && 
				typeof(method) === 'function'
			){
				doclet[tagName] = doclet[tagName].map(function(){
					return method.apply(me.parseTags, arguments);
				});
			}
		}
	},
	
	/**
	 * @deprecated
	 */
	_setDocletKind: function(doclet){
		// parse custom @interface tag to generate custom interface-kind doclets
		if(doclet.kind === 'member') {
			if(doclet.tags && doclet.tags.length) {
				for(var i = 0, n = doclet.tags.length; i < n; ++i) {
					if(doclet.tags[i].title === 'interface') {
						doclet.kind = 'interface';
						var url = this.helper.createLink(doclet);
						this.helper.registerLink(doclet.longname, url);
						this.log.dbg('Creando link a interface: ', doclet.longname, url);
					}
				}
			}
		}
	},
	
	/**
	 * @deprecated
	 */
	_setImplementations: function(doclet){
		// parse custom @implements tag to generate implements
		// and fill implementations hash
		if(doclet.kind === 'class' || doclet.kind === 'namespace') {
			if(doclet.tags && doclet.tags.length) {
				doclet['implements'] = [];
				for(var i = 0, n = doclet.tags.length; i < n; ++i) {
					if(doclet.tags[i].title === 'implements') {
						var iface = doclet.tags[i].value;

						var docletiface = this.find({
							longname: iface,
							kind: 'member'
						});
						if(docletiface.length > 0){
							docletiface = docletiface[0];
						}else{
							if(!this.implementations[iface]){
								this.log.error('Interface no encontrada', iface);
							}
						}
						if(docletiface){
							this.log.debug('### INTERFACE : ', iface, '###########')
							this.log.debug(docletiface)
							this.log.debug('### END:INTERFACE ###################')
							
							
							
							this._setDocletKind(docletiface);
						}

						// add to doclet's implements array
						doclet['implements'].push(iface);

						// add interface implementation to implementations hash
						if(!this.implementations[iface]) {
							this.implementations[iface] = [];
						}
						this.implementations[iface].push(doclet);
					}
				}
			}
		}
	},
	
	_createOutDir: function(){
		this.outdir = this.opts.destination;
		if(this.packageInfo && this.packageInfo.name) {
			outdir += '/' + this.packageInfo.name + '/' + this.packageInfo.version +'/';
		}
		this.fs.mkPath(this.outdir);
		this.log.dbg('created output dir ', this.outdir);
	},
	
	_copyStatic: function(){
		var fromDir = __dirname + '/templates/' + THEME + '/static',
			staticFiles = this.fs.ls(fromDir, 3),
			me = this
		;
		
		staticFiles.forEach(function(fileName) {
			var toDir = me.fs.toDir(fileName.replace(fromDir, me.outdir));
			me.fs.mkPath(toDir);
			me.fs.copyFile(fileName, toDir);
		});
	},
	
	_orderData: function(){
		this.data.orderBy(['longname', 'version', 'since']);
	},
	
	_prepareIndexVars: function(){
		// build terms dictionary and search index
		// searchIndex.info contains the following keys:
		// [0] -- title (term longname)
		// [1] -- namespace (term memberof)
		// [2] -- path (linkto(term,longname))
		// [3] -- params (term arguments)
		// [4] -- snippet (term description)
		// [5] -- ??? (number)
		// [6] -- badge
		
		this.indexes = {
			dict: {},
			seen: {},
			ifaces: {},
			searchIndex: {
				info: [],
				searchIndex: [],
				longSearchIndex: []
			}
		};
		
		// doclet kinds
		this.kinds = {
			'global': {
				once: true,
				data: this.find({ 
					kind: ['member', 'function', 'constant', 'typedef'],
					memberof: {
						isUndefined: true
					}
				})
			},
			'external': {
				once: true,
				data: this.find({
					kind: 'external'
				})
			},
			'module': {
				once: true,
				data: this.find({
					kind: 'module'
				})
			},
			'namespace': {
				once: true,
				data: this.find({
					kind: 'namespace'
				})
			},
			'class': {
				once: true,
				data: this.find({
					kind: 'class'
				})
			},
			'mixin': {
				once: true,
				data: this.find({
					kind: 'mixin'
				})
			},
			'constant': {
				once: false,
				data: this.find({
					kind: 'constant'
				})
			},
			'function': {
				once: false,
				data: this.find({
					kind: 'function'
				})
			},
			'member': {
				once: false,
				data: this.find({
					kind: 'member'
				})
			},
			'event': {
				once: false,
				data: this.find({
					kind: 'event'
				})
			}
		};
		
		this.kinds = this.parseTags.onSetKinds(this.kinds);
	},
	
	_buildSearchIndex: function(){
		this._prepareIndexVars();
		
		var n = 0, me = this;
		for(var i in this.kinds) {
			if(this.kinds.hasOwnProperty(i)) {
				var d = this.kinds[i].data;
        
				this.log.dbg('-- building ' + i + ' index (' + d.length + ' items)');
        
				if(d && d.length) {
					d.forEach(function(doc) {
						if(
							!me.kinds[i].once || 
							(
								me.kinds[i].once && 
									!me.indexes.seen.hasOwnProperty(doc.longname)
							)
						) {
							me.addToIndex(doc, i, n++);
						}
						me.indexes.seen[doc.longname] = true;
					});
					
					this.info[i] = true;
				} else {
					this.info[i] = false;
				}
			}
		}
	},
	
	_genFilesPages: function(){
		this.files = this.processFiles.process(this);
	},
	
	_generateOUTPUT: function(){
		this.parseTags.afterProccessDoclets();

		this.generate('Index', [], 'index.html', 'index');		

//		this.generate('', this.indexes.searchIndex, 'searchdata.js', 'searchdata');
		this._exportSearchData();

		var treeData = this.find({
			kind: ['namespace', 'class'],
			memberof: {
				isUndefined: true
			}
		});
		this.generate('', treeData, 'tree.js', 'tree');
		
		this.generate('Panel', [], 'panel.html', 'panel');
		
		for(var kindName in this.kinds){
			if(this.kinds.hasOwnProperty(kindName)){
				if(this.kinds[kindName].data.length) {
					this.log.dbg('generate ' + kindName + 'index');
					
					if(this._templateExists(kindName + '_index')){
						this.generate(
							kindName, 
							this.kinds[kindName].data, 
							kindName + '_index.html', 
							kindName + '_index'
						);
					}else{
						this.generate(
							kindName, 
							this.kinds[kindName].data, 
							kindName + '_index.html', 
							'kind_default_index'
						);
					}
				}
			}
		}
		
		// generate LICENSE
		if(this.info.license !== undefined) {
			this.generate('License', this.info, 'license.html', 'license');
		}
    
		// generate README
		if(this.info.readme !== undefined) {
			this.generate('Readme', this.info, 'readme.html', 'readme');
		}

		this._generateDocIndex();
		
		this.processFiles._generateSRCFilesPages();
	},
	
	_generateDocIndex: function(){
		// sort dictionary and generate docindex
		var sortedDict = {}, keys = [];
		for(var k in this.indexes.dict) {
			if(this.indexes.dict.hasOwnProperty(k)) {
				keys.push(k);
			}
		}
		keys.sort();
		for(var i = 0, n = keys.length; i < n; ++i) {
			sortedDict[ keys[i] ] = this.indexes.dict[ keys[i] ];
		}
		for(var i in this.indexes.dict) {
			this.indexes.dict[i].sort(function(a, b) {
				if(a.name.toLowerCase() < b.name.toLowerCase()) {
					return -1;
				} else if(b.name.toLowerCase() < a.name.toLowerCase()) {
					return 1;
				} else {
					if(a.kind < b.kind) {
						return -1;
					}
					if(b.kind < a.kind) {
						return 1;
					}
				}
				return 0;
			});
		}
		this.generate('Doc index', sortedDict, 'doc-index.html', 'docindex');
	},
	
	
	_exportSearchData: function(){
		this.log.dbg('Generating SearchData');
		var str = 'try{ window.searchData = ';
		str += JSON.stringify(this.indexes.searchIndex);
		str += ';}catch(e){if(console && console.log){ console.log(e);}}';

		this.fs.writeFileSync(this.opts.destination + '/searchdata.js', str);
		this.log.dbg('    DONE!');
	},
	
	/**
     * Adds a doclet to the index.
     * 
     * @param {Object} doc
     * @param {String} kind
     * @param {Number} badge
     * @returns {undefined}
     */
	addToIndex: function(doc, kind, badge) {
		// add dictionary entry
		var letter = doc.name.charAt(0).toUpperCase();
		if(!this.indexes.dict[letter]) {
			this.indexes.dict[letter] = [];
		}
		this.indexes.dict[letter].push({
			name: doc.name,
			data: doc,
			kind: kind
		});
		// add search entry
		this.indexes.searchIndex.searchIndex.push(doc.longname.toLowerCase());
		this.indexes.searchIndex.longSearchIndex.push(doc.longname.toLowerCase());
		this.indexes.searchIndex.info.push([
			doc.longname + (doc.augments && doc.augments.length ? ' < ' + doc.augments.join(', '): ''),
			doc.memberof,
			this.helper.longnameToUrl[doc.longname],
			(/global|external|module|namespace|member/.test(doc.kind) ? 
				'' : 
				// class, mixin, function, event
			doc.signature
		), 
			this.clean(doc.summary || doc.description || ''),
			badge
		]);
	},
	
	// #########################################################################
	// # HELPERS
	// #########################################################################

	/**
     * @param {Object} doclet
     * @param {String} hash
     * @returns {String}
     */
	hashToLink: function(doclet, hash) {
		if(!/^(#.+)/.test(hash)) { 
			return hash; 
		}
		
		var url = helper.createLink(doclet);
		
		url = url.replace(/(#.+|$)/, hash);
		return '<a href="' + url + '">' + hash + '</a>';
	},

	
	
	/**
     * A shortcut to find data through taffy.
     * 
     * @param {Object} spec
     * @returns {Object[]} The data found
     */
	find: function(spec){
		return this.data.get( this.data.find(spec) );
	},

	/**
     * Escapes HTML tags from string.
     * 
     * @param {String} string
     * @returns {String}
     */
	htmlsafe: function(str){
		return str
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
		;
	},
	
	/**
     * Helper to generate links.
     * 
     * @param {String} longname The link href
     * @param {String} linktext The link text
     * @returns {String}
     */
	linkto: function(longname, linktext, title) {
		var target = false;
		if(longname && (/^[\w]{3,6}:\/\//).test(longname)){
			url = longname;
			target = true;
		}else{
			var url = this.helper.longnameToUrl[longname];
			// Busco la URL al doclet
			if(!url) {
				// Si el doclet todavia no tiene url generada, lo busco,
				// la genero y registro la url.
				var linkdoclet = null;
				if(!this.linktoNotFound[longname]){
					linkdoclet = this.find({
						longname: longname
					});

//					this.log.dbg('## SEARCH | ', longname, ' #########');
//					this.log.dbg(linkdoclet);
//					this.log.dbg('############################################');


					if(linkdoclet.length > 0){
						linkdoclet = linkdoclet[0];
					}else{
						this.linktoNotFound[longname] = true;
					}
				}
				
				// TODO lvTODO dgTODO ver!

				if(linkdoclet && linkdoclet.name){
					url = this.helper.createLink(linkdoclet);
					this.helper.registerLink(linkdoclet.longname, url);
				}/* else {
					url = longname + '.html';
					this.helper.registerLink(longname, url);
				}*/
			}
			target = false;
		}

		return url ?  
			'<a href="' + url + '" ' + 
				(target ? 'target="_blank"' : '') +
			'>'+
				'<abbr title="' + (title || longname) + '">' + 
					(linktext || longname) + 
				'</abbr>' +
			'</a>' :
			(linktext || longname)
		;
	},
	
	/**
     * Cleans a string to a format suitable for JSON-encoding
     * 
     * @param {String} str
     * @returns {String}
     */
	clean: function(str) {
		str = str
			.replace(/\n/g, " ")
			.replace(/{@link (.*)}/ig, '$1')
			.replace(/<a[\w\s=#"'']*>(\w*)<\/a>/g, '$1')
			.replace(/@example(.*)@}/i, '')
			.replace(/<pre>(.*)<\pre>/i, '')
		;
		/*
		try {
			eval(JSON.stringify(str));
		} catch(e) {
			return '';
		}
		*/
		return str;
	},
	
	/**
     * Generates a doclet ancestry
     * 
     * @param {Object} doclet
     * @returns {String[]}
     */
	generateAncestors: function(doclet) {
		var ancestors = [], doc = doclet;
		while((doc = doc.memberof)) {
			doc = this.find({
				longname: doc
			});
			if(doc) { 
				doc = doc[0]; 
			}
			if(!doc) {
				break;
			}
			ancestors.unshift(
				this.linkto(
					doc.longname, 
					(this.scopeToPunc[doc.scope] || '') + doc.name
				)
			);
		}
		if(ancestors.length) {
			ancestors[ancestors.length - 1] += (this.scopeToPunc[doclet.scope] || '');
		}
		return ancestors;
	},

	/**
     * Generates a doclet signature
     * 
     * @param {Object} doclet
     * @returns {String}
     */
	generateSignature: function(doclet) {
		// generate signature
		var signature = [];
		if(doclet.params && doclet.params.length) {
			doclet.params.forEach(function(p) {
				var type = '';
				if(p.type && p.type.names) {
					p.type.names.forEach(function(name, i) {
						type += name;
						if(i < p.type.names.length - 1) {
							type += ' | ';
						}
					});
				}
				signature.push(type + ' ' + p.name);
			});
			return '(' + signature.join(', ') + ')';
		}else{
			return undefined;
		}
	},
	
	/**
     * Renders a template.
     * 
     * @param {String} path The path, relative to the theme template dir
     * @returns {String} the rendered template
     */ 
	render: function(templateName, partialData){
		var me = this,
			template
		;

		partialData.log = this.log;
		partialData.render = function(){
			return me.render.apply(me, arguments);
		};
		partialData.find = function(){
			return me.find.apply(me, arguments);
		};
		partialData.linkto = function(){
			return me.linkto.apply(me, arguments);
		};
		partialData.htmlsafe = function(){
			return me.htmlsafe.apply(me, arguments);
		};

		templateName = templateName.replace('.tmpl', '');

		if(this._templates[templateName]){
			template = this._templates[templateName];
		}else{
			
			template = this._templates[templateName] = this.template.render(
				this.fs.readFileSync(this.getTemplatePath(templateName))
			);
		}

		return template.call(partialData, partialData);
	},
	
	/**
     * Generates an HTML page
     * 
     * @param {String} title    The page title
     * @param {Object[]} docs   The page document (will be passed to the template)
     * @param {String} filename The target HTML page filename
     * @param {String} template The page template
     * @param {Boolean} raw     Whether to pass raw data to the template
     */
	generate: function(title, docs, filename, templateName, raw) {
		var me = this,
			data = {
				log: this.log,
				title: title,
				docs: docs,
				tmp: 'me cago en la puta',
				info: this.info,
				// helpers
				render: function(){return me.render.apply(me, arguments);},
				find: function(){return me.find.apply(me, arguments);},
				linkto: function(){return me.linkto.apply(me, arguments);},
				htmlsafe: function(){return me.htmlsafe.apply(me, arguments);}
			}
		;

		var template,
			outdir = this.opts.destination
		;
	
		if(this._templates[templateName]){
			template = this._templates[templateName];
		}else{
			template = this._templates[templateName] = this.template.render(
				this.fs.readFileSync(this.getTemplatePath(templateName))
			);
		}

		this.log.dbg('generating template ' + title + (raw ? ' (RAW)' : ''));
		this.log.dbg(' -- template: ' + templateName);
		this.log.dbg(' -- filename: ' + filename);

		var
			path = outdir + '/' + filename,
			html
		;
		
		html = template.call(data, data);

		html = raw ? html : this.helper.resolveLinks(html);

		// write template
		this.fs.writeFileSync(path, html);

		this.log.dbg('    DONE');
	},
	
	_fileExists: function(path){
		var f = new java.io.File(path);

		if (f.isDirectory()){
			return true;
		}
		if (!f.exists()){
			return false;
		}
		if (!f.canRead()){
			return false;
		}
		return true;
	},
	
	_templateExists: function(templateName){
		return this._fileExists(this.getTemplatePath(templateName));
	},
	
	getTemplatePath: function(templateName){
		return __dirname + '/templates/' + THEME + '/tmpl/' + 
					templateName + '.tmpl';
	},

	// #########################################################################
	// # END:HELPERS
	// #########################################################################
	
	log: {
		debugOn: true,
		dbg: function(msg){
			if(this.debugOn){
				Array.prototype.unshift.call(arguments, '[DEBUG] ');
				console.log.apply(console, arguments);
			}
			return this;
		},
		debug: function(msg){
			if(this.debugOn){
				Array.prototype.unshift.call(arguments, '[DEBUG] ');
				console.log.apply(console, arguments);
			}
			return this;
		},
		error: function(msg){
			Array.prototype.unshift.call(arguments, '[ERROR] ');
			console.log.apply(console, arguments);
			return this;
		},
		_: function(msg){
			console.log.apply(console, arguments);
			return this;
		}
	}
};
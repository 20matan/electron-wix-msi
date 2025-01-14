"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const lodash_1 = require("lodash");
const path = require("path");
const uuid = require("uuid/v4");
const spawn_1 = require("./utils/spawn");
const array_to_tree_1 = require("./utils/array-to-tree");
const detect_wix_1 = require("./utils/detect-wix");
const rc_edit_1 = require("./utils/rc-edit");
const replace_1 = require("./utils/replace");
const version_util_1 = require("./utils/version-util");
const walker_1 = require("./utils/walker");
const getTemplate = (name, trimTrailingNewLine = false) => {
    const content = fs.readFileSync(path.join(__dirname, `../static/${name}.xml`), 'utf-8');
    if (trimTrailingNewLine) {
        return content.replace(/[\r\n]+$/g, '');
    }
    else {
        return content;
    }
};
const ROOTDIR_NAME = 'APPLICATIONROOTDIRECTORY';
const debug = require('debug')('electron-wix-msi');
class MSICreator {
    constructor(options) {
        this.fileComponentTemplate = getTemplate('file-component');
        this.registryComponentTemplate = getTemplate('registry-component');
        this.permissionTemplate = getTemplate('permission');
        this.componentRefTemplate = getTemplate('component-ref');
        this.directoryTemplate = getTemplate('directory');
        this.wixTemplate = getTemplate('wix');
        this.uiTemplate = getTemplate('ui', true);
        this.wixVariableTemplate = getTemplate('wix-variable', true);
        this.updaterTemplate = getTemplate('updater-feature', true);
        this.updaterPermissions = getTemplate('updater-permissions');
        this.autoLaunchTemplate = getTemplate('auto-launch-feature', true);
        this.wxsFile = '';
        this.arch = 'x86';
        this.files = [];
        this.specialFiles = [];
        this.directories = [];
        this.registry = [];
        this.components = [];
        this.appDirectory = path.normalize(options.appDirectory);
        this.certificateFile = options.certificateFile;
        this.certificatePassword = options.certificatePassword;
        this.description = options.description;
        this.exe = options.exe.replace(/\.exe$/, '');
        this.iconPath = options.appIconPath;
        this.extensions = options.extensions || [];
        this.cultures = options.cultures;
        this.language = options.language || 1033;
        this.manufacturer = options.manufacturer;
        this.name = options.name;
        this.outputDirectory = options.outputDirectory;
        this.programFilesFolderName = options.programFilesFolderName || options.name;
        this.shortName = options.shortName || options.name;
        this.shortcutFolderName = options.shortcutFolderName || options.manufacturer;
        this.shortcutName = options.shortcutName || options.name;
        this.signWithParams = options.signWithParams;
        this.upgradeCode = options.upgradeCode || uuid();
        this.semanticVersion = options.version;
        this.windowsCompliantVersion = version_util_1.getWindowsCompliantVersion(options.version);
        this.arch = options.arch || 'x86';
        this.defaultInstallMode = options.defaultInstallMode || 'perMachine';
        this.productCode = uuid().toUpperCase();
        this.appUserModelId = options.appUserModelId
            || `com.squirrel.${this.shortName}.${this.exe}`.toLowerCase();
        this.ui = options.ui !== undefined ? options.ui : false;
        this.autoUpdate = false;
        this.autoLaunch = false;
        this.autoLaunchArgs = [];
        if (typeof options.features === 'object' && options.features !== null) {
            this.autoUpdate = options.features.autoUpdate;
            if (typeof options.features.autoLaunch === 'object' && options.features.autoLaunch !== null) {
                this.autoLaunch = options.features.autoLaunch.enabled;
                this.autoLaunchArgs = options.features.autoLaunch.arguments;
            }
            else {
                this.autoLaunch = options.features.autoLaunch;
            }
        }
    }
    create() {
        return __awaiter(this, void 0, void 0, function* () {
            const { files, directories } = yield walker_1.getDirectoryStructure(this.appDirectory);
            const registry = this.getRegistryKeys();
            const specialFiles = yield this.getSpecialFiles();
            this.files = files;
            this.specialFiles = specialFiles;
            this.directories = directories;
            this.registry = registry;
            this.tree = yield this.getTree();
            const { wxsContent, wxsFile } = yield this.createWxs();
            this.wxsFile = wxsFile;
            const supportBinaries = this.specialFiles.filter((f) => f.path.endsWith('.exe')).map((f) => f.path);
            return { wxsContent, wxsFile, supportBinaries };
        });
    }
    compile() {
        return __awaiter(this, void 0, void 0, function* () {
            const light = detect_wix_1.hasLight();
            const candle = detect_wix_1.hasCandle();
            if (!light || !light.has || !candle || !candle.has) {
                console.warn(`It appears that electron-wix-msi cannot find candle.exe or light.exe.`);
                console.warn(`Please consult the readme at https://github.com/felixrieseberg/electron-wix-msi`);
                console.warn(`for information on how to install the Wix toolkit, which is required.\n`);
                throw new Error(`Could not find light.exe or candle.exe`);
            }
            else {
                console.log(`electron-wix-msi: Using light.exe (${light.version}) and candle.exe (${candle.version})`);
            }
            if (!this.wxsFile) {
                throw new Error(`wxsFile not found. Did you run create() yet?`);
            }
            const { wixobjFile } = yield this.createWixobj();
            const { msiFile } = yield this.createMsi();
            yield this.signMSI(msiFile);
            return { wixobjFile, msiFile };
        });
    }
    createWxs() {
        return __awaiter(this, void 0, void 0, function* () {
            const target = path.join(this.outputDirectory, `${this.exe}.wxs`);
            const base = path.basename(this.appDirectory);
            const directories = yield this.getDirectoryForTree(this.tree, base, 8, this.programFilesFolderName, ROOTDIR_NAME);
            const componentRefs = yield this.getFeatureComponentRefs('main');
            const updaterComponentRefs = yield this.getFeatureComponentRefs('autoUpdate');
            const autoLaunchComponentRefs = yield this.getFeatureComponentRefs('autoLaunch');
            let enableChooseDirectory = false;
            if (typeof this.ui === 'object' && this.ui !== 'null') {
                const { chooseDirectory } = this.ui;
                enableChooseDirectory = chooseDirectory || false;
            }
            const scaffoldReplacements = {
                '<!-- {{ComponentRefs}} -->': componentRefs.map(({ xml }) => xml).join('\n'),
                '<!-- {{Directories}} -->': directories,
                '<!-- {{UI}} -->': this.getUI(),
                '<!-- {{AutoUpdatePermissions}} -->': this.autoUpdate ? this.updaterPermissions : '{{remove newline}}',
                '<!-- {{AutoUpdateFeature}} -->': this.autoUpdate ? this.updaterTemplate : '{{remove newline}}',
                '<!-- {{AutoLaunchFeature}} -->': this.autoLaunch ? this.autoLaunchTemplate : '{{remove newline}}',
                '<!-- {{UpdaterComponentRefs}} -->': updaterComponentRefs.map(({ xml }) => xml).join('\n'),
                '<!-- {{AutoLaunchComponentRefs}} -->': autoLaunchComponentRefs.map(({ xml }) => xml).join('\n'),
            };
            const replacements = {
                '{{ApplicationBinary}}': this.exe,
                '{{ApplicationDescription}}': this.description,
                '{{ApplicationName}}': this.name,
                '{{ApplicationShortcutGuid}}': uuid(),
                '{{ApplicationShortName}}': this.shortName,
                '{{AppUserModelId}}': this.appUserModelId,
                '{{Language}}': this.language.toString(10),
                '{{Manufacturer}}': this.manufacturer,
                '{{ShortcutFolderName}}': this.shortcutFolderName,
                '{{ShortcutName}}': this.shortcutName,
                '{{UpgradeCode}}': this.upgradeCode,
                '{{Version}}': this.windowsCompliantVersion,
                '{{SemanticVersion}}': this.semanticVersion,
                '{{Platform}}': this.arch,
                '{{ProgramFilesFolder}}': this.arch === 'x86' ? 'ProgramFilesFolder' : 'ProgramFiles64Folder',
                '{{ProcessorArchitecture}}': this.arch,
                '{{Win64YesNo}}': this.arch === 'x86' ? 'no' : 'yes',
                '{{DesktopShortcutGuid}}': uuid(),
                '{{ConfigurableDirectory}}': enableChooseDirectory ? `ConfigurableDirectory="${ROOTDIR_NAME}"` : '',
                '{{InstallPerUser}}': this.defaultInstallMode === 'perUser' ? '1' : '0',
                '{{ProductCode}}': this.productCode,
                '{{RandomGuid}}': uuid().toString(),
                '\r?\n.*{{remove newline}}': ''
            };
            const completeTemplate = replace_1.replaceInString(this.wixTemplate, scaffoldReplacements);
            const output = yield replace_1.replaceToFile(completeTemplate, target, replacements);
            return { wxsFile: target, wxsContent: output };
        });
    }
    createWixobj() {
        return __awaiter(this, void 0, void 0, function* () {
            return { wixobjFile: yield this.createFire('wixobj') };
        });
    }
    createMsi() {
        return __awaiter(this, void 0, void 0, function* () {
            return { msiFile: yield this.createFire('msi') };
        });
    }
    createFire(type) {
        return __awaiter(this, void 0, void 0, function* () {
            const cwd = path.dirname(this.wxsFile);
            const expectedObj = path.join(cwd, `${path.basename(this.wxsFile, '.wxs')}.${type}`);
            const binary = type === 'msi'
                ? 'light.exe'
                : 'candle.exe';
            const input = type === 'msi'
                ? path.join(cwd, `${path.basename(this.wxsFile, '.wxs')}.wixobj`)
                : this.wxsFile;
            if (this.ui && !this.extensions.find((e) => e === 'WixUIExtension')) {
                this.extensions.push('WixUIExtension');
            }
            if (!this.extensions.find((e) => e === 'WixUtilExtension')) {
                this.extensions.push('WixUtilExtension');
            }
            const preArgs = lodash_1.flatMap(this.extensions.map((e) => (['-ext', e])));
            if (type === 'msi' && this.cultures) {
                preArgs.unshift(`-cultures:${this.cultures}`);
            }
            preArgs.unshift(`-sval`);
            console.log('preArgs = ', preArgs);
            const { code, stderr, stdout } = yield spawn_1.spawnPromise(binary, [...preArgs, input], {
                env: process.env,
                cwd
            });
            if (code === 0 && fs.existsSync(expectedObj)) {
                return expectedObj;
            }
            else {
                throw new Error(`Could not create ${type} file. Code: ${code} StdErr: ${stderr} StdOut: ${stdout}`);
            }
        });
    }
    signMSI(msiFile) {
        return __awaiter(this, void 0, void 0, function* () {
            const { certificatePassword, certificateFile, signWithParams } = this;
            const signToolPath = path.join(__dirname, '../vendor/signtool.exe');
            if (!certificateFile && !signWithParams) {
                debug('Signing not necessary, no certificate file or parameters given');
                return;
            }
            if (!signWithParams && !certificatePassword) {
                throw new Error('You must provide a certificatePassword with a certificateFile');
            }
            const args = signWithParams
                ? signWithParams.match(/(?:[^\s"]+|"[^"]*")+/g)
                : ['/a', '/f', path.resolve(certificateFile), '/p', certificatePassword];
            const { code, stderr, stdout } = yield spawn_1.spawnPromise(signToolPath, ['sign', ...args, msiFile], {
                env: process.env,
                cwd: path.join(__dirname, '../vendor'),
            });
            if (code !== 0) {
                throw new Error(`Signtool exited with code ${code}. Stderr: ${stderr}. Stdout: ${stdout}`);
            }
        });
    }
    getUI() {
        let xml = '';
        if (this.ui) {
            xml = this.uiTemplate;
        }
        if (typeof this.ui === 'object' && this.ui !== 'null') {
            const { template } = this.ui;
            const variablesXml = this.getUIVariables(this.ui);
            const uiTemplate = template || this.uiTemplate;
            xml = replace_1.replaceInString(uiTemplate, {
                '<!-- {{WixVariables}} -->': variablesXml.length > 0 ? variablesXml : '{{remove newline}}'
            });
        }
        return xml;
    }
    getUIVariables(ui) {
        const images = ui.images || {};
        const variableMap = {
            background: 'WixUIDialogBmp',
            banner: 'WixUIBannerBmp',
            exclamationIcon: 'WixUIExclamationIco',
            infoIcon: 'WixUIInfoIco',
            newIcon: 'WixUINewIco',
            upIcon: 'WixUIUpIco'
        };
        return Object.keys(images)
            .map((key) => {
            return variableMap[key]
                ? replace_1.replaceInString(this.wixVariableTemplate, {
                    '{{Key}}': variableMap[key],
                    '{{Value}}': images[key]
                })
                : '';
        })
            .join('\n');
    }
    getDirectoryForTree(tree, treePath, indent, name, id) {
        const childDirectories = Object.keys(tree)
            .filter((k) => !k.startsWith('__ELECTRON_WIX_MSI'))
            .map((k) => {
            return this.getDirectoryForTree(tree[k], tree[k].__ELECTRON_WIX_MSI_PATH__, indent + 2, tree[k].__ELECTRON_WIX_MSI_DIR_NAME__);
        });
        const childFiles = tree.__ELECTRON_WIX_MSI_FILES__
            .map((file) => {
            const component = this.getFileComponent(file, indent + 2);
            this.components.push(component);
            return component.xml;
        });
        const childRegistry = tree.__ELECTRON_WIX_MSI_REGISTRY__
            .map((registry) => {
            const component = this.getRegistryComponent(registry, indent + 2);
            this.components.push(component);
            return component.xml;
        });
        const children = [childDirectories.join('\n'),
            childFiles.join('\n'),
            childRegistry.length > 0 ? '\n' : '',
            childRegistry.join('\n')].join('');
        const directoryXml = replace_1.replaceInString(this.directoryTemplate, {
            '<!-- {{I}} -->': lodash_1.padStart('', indent),
            '{{DirectoryId}}': id || this.getComponentId(treePath),
            '{{DirectoryName}}': name,
            '<!-- {{Children}} -->': children
        });
        return `${directoryXml}${childDirectories.length > 0 && !id ? '\n' : ''}`;
    }
    getTree() {
        return __awaiter(this, void 0, void 0, function* () {
            const root = this.appDirectory;
            const folderTree = array_to_tree_1.arrayToTree(this.directories, root, this.semanticVersion);
            const fileFolderTree = array_to_tree_1.addFilesToTree(folderTree, this.files, this.specialFiles, this.registry, this.semanticVersion);
            return fileFolderTree;
        });
    }
    getFeatureComponentRefs(feature) {
        return this.components
            .filter((c) => c.featureAffinity === feature)
            .map(({ componentId }) => {
            const xml = replace_1.replaceInString(this.componentRefTemplate, {
                '<!-- {{I}} -->': '        ',
                '{{ComponentId}}': componentId
            });
            return { componentId, xml };
        });
    }
    getFileComponent(file, indent) {
        const guid = uuid();
        const componentId = this.getComponentId(file.path);
        const xml = replace_1.replaceInString(this.fileComponentTemplate, {
            '<!-- {{I}} -->': lodash_1.padStart('', indent),
            '{{ComponentId}}': componentId,
            '{{FileId}}': componentId,
            '{{Name}}': file.name,
            '{{Guid}}': guid,
            '{{SourcePath}}': file.path
        });
        return { guid, componentId, xml, file, featureAffinity: file.featureAffinity || 'main' };
    }
    getRegistryComponent(registry, indent) {
        const guid = uuid();
        const permissionXml = registry.permission ? replace_1.replaceInString(this.permissionTemplate, {
            '{{User}}': registry.permission.user,
            '{{GenericAll}}': registry.permission.genericAll,
        }) : '{{remove newline}}';
        const xml = replace_1.replaceInString(this.registryComponentTemplate, {
            '<!-- {{I}} -->': lodash_1.padStart('', indent),
            '{{ComponentId}}': registry.id,
            '{{Guid}}': guid,
            '{{Name}}': registry.name,
            '{{Root}}': registry.root,
            '{{Key}}': registry.key,
            '{{Type}}': registry.type,
            '{{Value}}': registry.value,
            '{{ForceCreateOnInstall}}': registry.forceCreateOnInstall || 'no',
            '{{ForceDeleteOnUninstall}}': registry.forceDeleteOnUninstall || 'no',
            '<!-- {{Permission}} -->': permissionXml
        });
        return { guid, componentId: registry.id, xml, featureAffinity: registry.featureAffinity || 'main' };
    }
    getComponentId(filePath) {
        const pathId = filePath
            .replace(this.appDirectory, '')
            .replace(/^\\|\//g, '');
        const pathPart = pathId.length > 34
            ? path.basename(filePath).slice(0, 34)
            : pathId;
        const uniqueId = `_${pathPart}_${uuid()}`;
        return uniqueId.replace(/[^A-Za-z0-9_\.]/g, '_');
    }
    getSpecialFiles() {
        return __awaiter(this, void 0, void 0, function* () {
            const specialFiles = new Array();
            const stubExe = yield rc_edit_1.createStubExe(this.appDirectory, this.exe, this.shortName, this.manufacturer, this.description, this.windowsCompliantVersion, this.iconPath);
            const installInfoFile = version_util_1.createInstallInfoFile(this.manufacturer, this.shortName, this.productCode, this.semanticVersion, this.arch);
            specialFiles.push({ name: `${this.exe}.exe`, path: stubExe });
            specialFiles.push({ name: `.installInfo.json`, path: installInfoFile });
            if (this.autoUpdate) {
                specialFiles.push({
                    name: `Update.exe`,
                    path: path.join(__dirname, '../vendor/msq.exe'),
                    featureAffinity: 'autoUpdate'
                });
            }
            return specialFiles;
        });
    }
    getRegistryKeys() {
        const registry = new Array();
        const uninstallKey = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{{{ProductCode}}}.msq';
        const productRegKey = 'SOFTWARE\\{{Manufacturer}}\\{{ApplicationShortName}}';
        registry.push({
            id: 'RegistryInstallPath',
            root: 'HKMU',
            name: 'InstallPath',
            key: uninstallKey,
            type: 'string',
            value: '[APPLICATIONROOTDIRECTORY]',
            forceDeleteOnUninstall: 'yes'
        });
        registry.push({
            id: 'UninstallDisplayName',
            root: 'HKMU',
            name: 'DisplayName',
            key: uninstallKey,
            type: 'string',
            value: '[VisibleProductName]',
            forceDeleteOnUninstall: 'yes'
        });
        registry.push({
            id: 'UninstallPublisher',
            root: 'HKMU',
            name: 'Publisher',
            key: uninstallKey,
            type: 'string',
            value: '{{Manufacturer}}',
            forceDeleteOnUninstall: 'yes'
        });
        registry.push({
            id: 'UninstallDisplayVersion',
            root: 'HKMU',
            name: 'DisplayVersion',
            key: uninstallKey,
            type: 'string',
            value: '{{SemanticVersion}}',
            forceDeleteOnUninstall: 'yes'
        });
        registry.push({
            id: 'UninstallModifyString',
            root: 'HKMU',
            name: 'ModifyPath',
            key: uninstallKey,
            type: 'expandable',
            value: 'MsiExec.exe /I {{{ProductCode}}}',
            forceDeleteOnUninstall: 'yes'
        });
        registry.push({
            id: 'UninstallString',
            root: 'HKMU',
            name: 'UninstallString',
            key: uninstallKey,
            type: 'expandable',
            value: 'MsiExec.exe /X {{{ProductCode}}}',
            forceDeleteOnUninstall: 'yes'
        });
        registry.push({
            id: 'UninstallDisplayIcon',
            root: 'HKMU',
            name: 'DisplayIcon',
            key: uninstallKey,
            type: 'expandable',
            value: this.arch === 'x86' ? '[SystemFolder]msiexec.exe' : '[System64Folder]msiexec.exe',
            forceDeleteOnUninstall: 'yes'
        });
        if (this.autoUpdate) {
            registry.push({
                id: 'SetUninstallDisplayVersionPermissions',
                root: 'HKMU',
                name: 'DisplayVersion',
                key: uninstallKey,
                type: 'string',
                value: '{{SemanticVersion}}',
                featureAffinity: 'autoUpdate',
                permission: {
                    user: '[UPDATERUSERGROUP]',
                    genericAll: 'yes'
                },
                forceCreateOnInstall: 'yes',
            });
            registry.push({
                id: 'AutoUpdateEnabled',
                root: 'HKMU',
                name: 'AutoUpdate',
                key: productRegKey,
                type: 'integer',
                value: '[AUTOUPDATEENABLED]',
                featureAffinity: 'autoUpdate',
                forceDeleteOnUninstall: 'yes'
            });
        }
        if (this.autoLaunch) {
            const args = this.autoLaunchArgs.length > 0 ?
                ` ${this.autoLaunchArgs.join(' ')}`.replace(/"/gi, '&quot;') : '';
            registry.push({
                id: 'RegistryRunKey',
                root: 'HKMU',
                name: '{{AppUserModelId}}',
                key: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
                type: 'string',
                value: `&quot;[APPLICATIONROOTDIRECTORY]{{ApplicationBinary}}.exe&quot;${args}`,
                featureAffinity: 'autoLaunch',
                forceDeleteOnUninstall: 'no'
            });
        }
        return registry;
    }
}
exports.MSICreator = MSICreator;
//# sourceMappingURL=creator.js.map
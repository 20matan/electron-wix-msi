export interface MSICreatorOptions {
    appDirectory: string;
    appUserModelId?: string;
    description: string;
    exe: string;
    appIconPath?: string;
    extensions?: Array<string>;
    cultures?: string;
    language?: number;
    manufacturer: string;
    name: string;
    outputDirectory: string;
    programFilesFolderName?: string;
    shortName?: string;
    shortcutFolderName?: string;
    shortcutName?: string;
    ui?: UIOptions | boolean;
    upgradeCode?: string;
    version: string;
    signWithParams?: string;
    certificateFile?: string;
    certificatePassword?: string;
    arch?: 'x64' | 'ia64' | 'x86';
    features?: Features | false;
    defaultInstallMode?: 'perUser' | 'perMachine';
}
export interface UIOptions {
    chooseDirectory?: boolean;
    template?: string;
    images?: UIImages;
}
export interface UIImages {
    background?: string;
    banner?: string;
    exclamationIcon?: string;
    infoIcon?: string;
    newIcon?: string;
    upIcon?: string;
}
export interface AutoLaunchOptions {
    enabled: boolean;
    arguments: Array<string>;
}
export interface Features {
    autoUpdate: boolean;
    autoLaunch: boolean | AutoLaunchOptions;
}
export declare class MSICreator {
    fileComponentTemplate: string;
    registryComponentTemplate: string;
    permissionTemplate: string;
    componentRefTemplate: string;
    directoryTemplate: string;
    wixTemplate: string;
    uiTemplate: string;
    wixVariableTemplate: string;
    updaterTemplate: string;
    updaterPermissions: string;
    autoLaunchTemplate: string;
    wxsFile: string;
    appDirectory: string;
    appUserModelId: string;
    description: string;
    exe: string;
    iconPath?: string;
    extensions: Array<string>;
    cultures?: string;
    language: number;
    manufacturer: string;
    name: string;
    outputDirectory: string;
    programFilesFolderName: string;
    shortName: string;
    shortcutFolderName: string;
    shortcutName: string;
    upgradeCode: string;
    windowsCompliantVersion: string;
    semanticVersion: string;
    certificateFile?: string;
    certificatePassword?: string;
    signWithParams?: string;
    arch: 'x64' | 'ia64' | 'x86';
    autoUpdate: boolean;
    autoLaunch: boolean;
    autoLaunchArgs: Array<string>;
    defaultInstallMode: 'perUser' | 'perMachine';
    productCode: string;
    ui: UIOptions | boolean;
    private files;
    private specialFiles;
    private directories;
    private registry;
    private tree;
    private components;
    constructor(options: MSICreatorOptions);
    create(): Promise<{
        wxsFile: string;
        wxsContent: string;
        supportBinaries: Array<string>;
    }>;
    compile(): Promise<{
        wixobjFile: string;
        msiFile: string;
    }>;
    private createWxs;
    private createWixobj;
    private createMsi;
    private createFire;
    private signMSI;
    private getUI;
    private getUIVariables;
    private getDirectoryForTree;
    private getTree;
    private getFeatureComponentRefs;
    private getFileComponent;
    private getRegistryComponent;
    private getComponentId;
    private getSpecialFiles;
    private getRegistryKeys;
}

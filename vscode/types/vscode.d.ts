/**
 * vscode.d.ts — KHAI BÁO TỐI THIỂU của module `vscode`, chỉ phần extension này dùng.
 *
 * Vì sao không dùng `@types/vscode`: spike V0 tránh thêm phụ thuộc mới vào repo
 * (kể cả devDependency). Mọi chữ ký dưới đây chép đúng từ `@types/vscode@1.106.1`
 * (khớp `engines.vscode: ^1.106.0`) và ĐÃ được đối chiếu bằng cách biên dịch
 * `src/` với bản `@types/vscode` thật (xem README, mục "Kiểm kiểu với bản thật").
 * Muốn chuyển sang bản thật: thêm `@types/vscode` (MIT) và xoá file này.
 *
 * Lúc chạy, module `vscode` do chính VS Code cung cấp — file này không sinh JS.
 */
declare module 'vscode' {
  export interface Thenable<T> extends PromiseLike<T> {}

  export class Disposable {
    constructor(callOnDispose: () => any);
    dispose(): any;
  }

  export interface Event<T> {
    (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
  }

  export class Uri {
    static joinPath(base: Uri, ...pathSegments: string[]): Uri;
    readonly fsPath: string;
    toString(skipEncoding?: boolean): string;
  }

  export interface Memento {
    get<T>(key: string): T | undefined;
    update(key: string, value: any): Thenable<void>;
  }

  export interface ExtensionContext {
    readonly subscriptions: { dispose(): any }[];
    readonly workspaceState: Memento;
    readonly extensionUri: Uri;
    readonly extensionPath: string;
  }

  export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
    Two = 2,
    Three = 3,
  }

  export interface WebviewPortMapping {
    readonly webviewPort: number;
    readonly extensionHostPort: number;
  }

  export interface WebviewOptions {
    readonly enableScripts?: boolean;
    readonly localResourceRoots?: readonly Uri[];
    readonly portMapping?: readonly WebviewPortMapping[];
  }

  export interface WebviewPanelOptions {
    readonly enableFindWidget?: boolean;
    readonly retainContextWhenHidden?: boolean;
  }

  export interface Webview {
    options: WebviewOptions;
    html: string;
    readonly onDidReceiveMessage: Event<any>;
    postMessage(message: any): Thenable<boolean>;
    asWebviewUri(localResource: Uri): Uri;
    readonly cspSource: string;
  }

  export interface WebviewPanelOnDidChangeViewStateEvent {
    readonly webviewPanel: WebviewPanel;
  }

  export interface WebviewPanel {
    readonly viewType: string;
    title: string;
    iconPath?: Uri | { readonly light: Uri; readonly dark: Uri };
    readonly webview: Webview;
    readonly active: boolean;
    readonly visible: boolean;
    readonly onDidChangeViewState: Event<WebviewPanelOnDidChangeViewStateEvent>;
    readonly onDidDispose: Event<void>;
    reveal(viewColumn?: ViewColumn, preserveFocus?: boolean): void;
    dispose(): any;
  }

  export interface WebviewView {
    readonly viewType: string;
    readonly webview: Webview;
    readonly onDidDispose: Event<void>;
    readonly visible: boolean;
    readonly onDidChangeVisibility: Event<void>;
  }

  export interface WebviewViewResolveContext<T = unknown> {
    readonly state: T | undefined;
  }

  export interface CancellationToken {
    isCancellationRequested: boolean;
  }

  export interface WebviewViewProvider {
    resolveWebviewView(
      webviewView: WebviewView,
      context: WebviewViewResolveContext,
      token: CancellationToken,
    ): Thenable<void> | void;
  }

  export interface OutputChannel {
    readonly name: string;
    appendLine(value: string): void;
    show(preserveFocus?: boolean): void;
    dispose(): void;
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string): T | undefined;
  }

  export interface WorkspaceFolder {
    readonly uri: Uri;
    readonly name: string;
    readonly index: number;
  }

  export interface ConfigurationChangeEvent {
    affectsConfiguration(section: string): boolean;
  }

  export namespace window {
    export function createOutputChannel(name: string, languageId?: string): OutputChannel;
    export function createWebviewPanel(
      viewType: string,
      title: string,
      showOptions: ViewColumn | { readonly viewColumn: ViewColumn; readonly preserveFocus?: boolean },
      options?: WebviewPanelOptions & WebviewOptions,
    ): WebviewPanel;
    export function registerWebviewViewProvider(
      viewId: string,
      provider: WebviewViewProvider,
      options?: { readonly webviewOptions?: { readonly retainContextWhenHidden?: boolean } },
    ): Disposable;
    export function showInformationMessage<T extends string>(message: string, ...items: T[]): Thenable<T | undefined>;
    export function showWarningMessage<T extends string>(message: string, ...items: T[]): Thenable<T | undefined>;
  }

  export namespace commands {
    export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable;
  }

  export namespace workspace {
    export const workspaceFolders: readonly WorkspaceFolder[] | undefined;
    export function getConfiguration(section?: string): WorkspaceConfiguration;
    export const onDidChangeConfiguration: Event<ConfigurationChangeEvent>;
  }
}

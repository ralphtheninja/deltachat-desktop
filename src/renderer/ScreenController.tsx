import React from 'react'
import { Component, createRef } from 'react'
const { ipcRenderer } = window.electron_functions

import { ScreenContext } from './contexts'
import MainScreen from './components/screens/MainScreen'
import DialogController, {
  OpenDialogFunctionType,
  CloseDialogFunctionType,
} from './components/dialogs/DialogController'
import processOpenQrUrl from './components/helpers/OpenQrUrl'

import { getLogger } from '../shared/logger'
import { ContextMenuLayer, showFnType } from './components/ContextMenu'
import { DeltaBackend } from './delta-remote'
import { ActionEmitter, KeybindAction } from './keybindings'
import AccountSetupScreen from './components/screens/AccountSetupScreen'
import AccountListScreen from './components/screens/AccountListScreen'
import WelcomeScreen from './components/screens/WelcomeScreen'

const log = getLogger('renderer/ScreenController')

export interface userFeedback {
  type: 'error' | 'success'
  text: string
}

export enum Screens {
  Welcome = 'welcome',
  Main = 'main',
  Login = 'login',
  Loading = 'loading',
  AccountList = 'accountSelection',
}

export default class ScreenController extends Component {
  dialogController: React.RefObject<DialogController>
  contextMenuShowFn: showFnType | null = null
  state: { message: userFeedback | false; screen: Screens }
  onShowAbout: any
  onShowKeybindings: any
  onShowSettings: any
  selectedAccountId: number | undefined

  constructor(public props: {}) {
    super(props)
    this.state = {
      message: false,
      screen: Screens.Loading,
    }

    this.onError = this.onError.bind(this)
    this.onSuccess = this.onSuccess.bind(this)
    this.userFeedback = this.userFeedback.bind(this)
    this.userFeedbackClick = this.userFeedbackClick.bind(this)
    this.openContextMenu = this.openContextMenu.bind(this)
    this.openDialog = this.openDialog.bind(this)
    this.changeScreen = this.changeScreen.bind(this)
    this.closeDialog = this.closeDialog.bind(this)
    this.onShowAbout = this.showAbout.bind(this)
    this.onShowKeybindings = this.showKeyBindings.bind(this)
    this.onShowSettings = this.showSettings.bind(this)
    this.dialogController = createRef()
    this.selectAccount = this.selectAccount.bind(this)

    window.__openDialog = this.openDialog.bind(this)
    window.__userFeedback = this.userFeedback.bind(this)
    window.__closeDialog = this.closeDialog.bind(this)
    window.__changeScreen = this.changeScreen.bind(this)
    window.__selectAccount = this.selectAccount.bind(this)
    window.__screen = this.state.screen
  }

  private async startup() {
    const lastLoggedInAccountId = await DeltaBackend.call(
      'login.getLastLoggedInAccount'
    )
    if (lastLoggedInAccountId && !(lastLoggedInAccountId < 0)) {
      await this.selectAccount(lastLoggedInAccountId)
    } else {
      const allAccountIds = await DeltaBackend.call('login.getAllAccountIds')
      if (allAccountIds && allAccountIds.length > 0) {
        this.changeScreen(Screens.AccountList)
      } else {
        const accountId = await DeltaBackend.call('login.addAccount')
        await this.selectAccount(accountId)
      }
    }
  }

  async selectAccount(accountId: number) {
    await DeltaBackend.call('login.selectAccount', accountId)
    this.selectedAccountId = accountId
    const account = await DeltaBackend.call('login.accountInfo', accountId)
    if (account.type === 'configured') {
      this.changeScreen(Screens.Main)
    } else {
      this.changeScreen(Screens.Welcome)
    }
  }

  userFeedback(message: userFeedback | false) {
    if (message !== false && this.state.message === message) return // one at a time, cowgirl
    this.setState({ message })
  }

  userFeedbackClick() {
    this.userFeedback(false)
  }

  changeScreen(screen: Screens) {
    log.debug('Changing screen to:', screen)
    this.setState({ screen })
    window.__screen = screen
    if (Screens.Welcome) {
      // remove user feedback error message - https://github.com/deltachat/deltachat-desktop/issues/2261
      this.userFeedback(false)
    }
  }

  componentDidMount() {
    ipcRenderer.on('error', this.onError)
    ipcRenderer.on('DC_EVENT_ERROR', this.onError)
    ipcRenderer.on('success', this.onSuccess)
    ipcRenderer.on('showAboutDialog', this.onShowAbout)
    ipcRenderer.on('showKeybindingsDialog', this.onShowKeybindings)
    ipcRenderer.on('showSettingsDialog', this.onShowSettings)
    ipcRenderer.on('open-url', this.onOpenUrl)

    this.startup().then(() => {
      ipcRenderer.send('frontendReady')
    })
  }

  componentWillUnmount() {
    ipcRenderer.removeListener('showAboutDialog', this.onShowAbout)
    ipcRenderer.removeListener('showSettingsDialog', this.onShowSettings)
    ipcRenderer.removeListener('error', this.onError)
    ipcRenderer.removeListener('DC_EVENT_ERROR', this.onError)
    ipcRenderer.removeListener('success', this.onSuccess)
    ipcRenderer.removeListener('open-url', this.onOpenUrl)
  }

  onError(_event: any, [data1, data2]: [string | number, string]) {
    if (this.state.screen === Screens.Welcome) return
    if (data1 === 0) data1 = ''
    const text = data1 + data2
    this.userFeedback({ type: 'error', text })
  }

  onSuccess(_event: any, text: string) {
    this.userFeedback({ type: 'success', text })
  }

  showAbout() {
    this.openDialog('About')
  }

  showSettings() {
    ActionEmitter.emitAction(KeybindAction.Settings_Open)
  }

  showKeyBindings() {
    ActionEmitter.emitAction(KeybindAction.KeybindingCheatSheet_Open)
  }

  async onOpenUrl(_event: Event, url: string) {
    processOpenQrUrl(url)
  }

  openDialog(...args: Parameters<OpenDialogFunctionType>) {
    if (!this.dialogController.current) {
      throw new Error('dialog controller not ready')
    }
    return this.dialogController.current.openDialog(...args)
  }

  closeDialog(...args: Parameters<CloseDialogFunctionType>) {
    if (!this.dialogController.current) {
      throw new Error('dialog controller not ready')
    }
    this.dialogController.current?.closeDialog(...args)
  }

  openContextMenu(...args: Parameters<showFnType>) {
    if (!this.contextMenuShowFn) {
      throw new Error('Context Menu Controller not available')
    }
    this.contextMenuShowFn(...args)
  }

  renderScreen() {
    switch (this.state.screen) {
      case Screens.Main:
        return <MainScreen />
      case Screens.Login:
        if (this.selectedAccountId === undefined) {
          throw new Error('Selected account not defined')
        }
        return (
          <AccountSetupScreen
            selectAccount={this.selectAccount}
            accountId={this.selectedAccountId}
          />
        )
      case Screens.Welcome:
        if (this.selectedAccountId === undefined) {
          throw new Error('Selected account not defined')
        }
        return <WelcomeScreen selectedAccountId={this.selectedAccountId} />
      case Screens.AccountList:
        return (
          <AccountListScreen
            {...{
              selectAccount: this.selectAccount,
              onAddAccount: async () => {
                const accountId = await DeltaBackend.call('login.addAccount')
                await this.selectAccount(accountId)
              },
            }}
          />
        )
      default:
        return null
    }
  }

  render() {
    return (
      <div>
        <ContextMenuLayer
          setShowFunction={showFn => {
            this.contextMenuShowFn = showFn
          }}
        />
        {this.state.message && (
          <div
            onClick={this.userFeedbackClick}
            className={`user-feedback ${this.state.message.type}`}
          >
            <p>{this.state.message.text}</p>
          </div>
        )}
        <ScreenContext.Provider
          value={{
            openDialog: this.openDialog,
            openContextMenu: this.openContextMenu,
            closeDialog: this.closeDialog,
            userFeedback: this.userFeedback,
            changeScreen: this.changeScreen,
            screen: this.state.screen,
          }}
        >
          {this.renderScreen()}
          <DialogController
            ref={this.dialogController}
            userFeedback={this.userFeedback}
          />
        </ScreenContext.Provider>
      </div>
    )
  }
}

import {
  onDownload,
  openAttachmentInShell,
  forwardMessage,
  deleteMessage,
  openMessageInfo,
} from './messageFunctions'
import React, { useContext, useState, useEffect } from 'react'

import classNames from 'classnames'
import MessageBody from './MessageBody'
import MessageMetaData from './MessageMetaData'

import Attachment from '../attachment/messageAttachment'
import {
  MessageType,
  DCContact,
  MessageTypeAttachment,
  msgStatus,
} from '../../../shared/shared-types'
import { isGenericAttachment } from '../attachment/Attachment'
import { useTranslationFunction, ScreenContext } from '../../contexts'
import { joinCall, openViewProfileDialog } from '../helpers/ChatMethods'
import { C } from 'deltachat-node/dist/constants'
import { getLogger } from '../../../shared/logger'
import { useChatStore2, ChatStoreDispatch } from '../../stores/chat'
import { DeltaBackend } from '../../delta-remote'

const log = getLogger('renderer/message')

const Avatar = (
  contact: DCContact,
  onContactClick: (contact: DCContact) => void
) => {
  const { profileImage, color, displayName } = contact

  const onClick = () => onContactClick(contact)

  if (profileImage) {
    return (
      <div className='author-avatar' onClick={onClick}>
        <img alt={displayName} src={profileImage} />
      </div>
    )
  } else {
    const codepoint = displayName && displayName.codePointAt(0)
    const initial = codepoint
      ? String.fromCodePoint(codepoint).toUpperCase()
      : '#'
    return (
      <div
        className='author-avatar default'
        aria-label={displayName}
        onClick={onClick}
      >
        <div style={{ backgroundColor: color }} className='label'>
          {initial}
        </div>
      </div>
    )
  }
}

const ContactName = (props: {
  email: string
  name: string
  profileName?: string
  color: string
  onClick: (event: React.MouseEvent<HTMLSpanElement, MouseEvent>) => void
}) => {
  const { email, name, profileName, color, onClick } = props

  const title = name || email
  const shouldShowProfile = Boolean(profileName && !name)
  const profileElement = shouldShowProfile ? (
    <span style={{ color: color }}>~{profileName || ''}</span>
  ) : null

  return (
    <span className='author' style={{ color: color }} onClick={onClick}>
      {title}
      {shouldShowProfile ? ' ' : null}
      {profileElement}
    </span>
  )
}

const Author = (
  contact: DCContact,
  onContactClick: (contact: DCContact) => void
) => {
  const { color, name, address } = contact

  return (
    <ContactName
      email={address}
      name={name}
      color={color}
      onClick={() => onContactClick(contact)}
    />
  )
}

const InlineMenu = (
  showMenu: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
  attachment: MessageTypeAttachment,
  message: MessageType | { msg: null },
  // onReply
  viewType: number
) => {
  const tx = useTranslationFunction()

  return (
    <div className='message-buttons'>
      {attachment && viewType !== 23 && !message.msg.isSetupmessage && (
        <div
          onClick={onDownload.bind(null, message.msg)}
          role='button'
          className='msg-button download hide-on-small'
          aria-label={tx('save')}
        />
      )}
      {/* <div
        onClick={onReply}
        role='button'
        className='msg-button reply hide-on-small'
      /> */}
      <div className='msg-button-wrapper'>
        <div
          role='button'
          onClick={showMenu}
          className='msg-button menu'
          aria-label={tx('a11y_message_context_menu_btn_label')}
        />
      </div>
    </div>
  )
}

function buildContextMenu(
  {
    attachment,
    direction,
    status,
    message,
    // onReply,
    // onRetrySend,
    text,
  }: {
    attachment: MessageTypeAttachment
    direction: 'incoming' | 'outgoing'
    status: msgStatus
    message: MessageType | { msg: null }
    text?: string
    // onReply:Function
    // onRetrySend: Function
  },
  link: string,
  chatStoreDispatch: ChatStoreDispatch
) {
  const tx = window.static_translate // don't use the i18n context here for now as this component is inefficient (rendered one menu for every message)

  const showRetry = status === 'error' && direction === 'outgoing'
  const showAttachmentOptions = attachment && !message.msg.isSetupmessage

  const textSelected: boolean = window.getSelection().toString() !== ''

  return [
    showAttachmentOptions &&
      isGenericAttachment(attachment) && {
        label: tx('open_attachment'),
        action: openAttachmentInShell.bind(null, message.msg),
      },
    link !== '' && {
      label: tx('menu_copy_link_to_clipboard'),
      action: () => navigator.clipboard.writeText(link),
    },
    textSelected
      ? {
          label: tx('menu_copy_selection_to_clipboard'),
          action: () => {
            navigator.clipboard.writeText(window.getSelection().toString())
          },
        }
      : {
          label: tx('menu_copy_to_clipboard'),
          action: () => {
            navigator.clipboard.writeText(text)
          },
        },
    showAttachmentOptions && {
      label: tx('download_attachment_desktop'),
      action: onDownload.bind(null, message.msg),
    },
    // {
    //   label: tx('reply_to_message_desktop'),
    //   action: onReply
    // },
    {
      label: tx('menu_forward'),
      action: forwardMessage.bind(null, message),
    },
    {
      label: tx('menu_message_details'),
      action: openMessageInfo.bind(null, message),
    },
    // showRetry && {
    //   label:tx('retry_send'),
    //   action: onRetrySend
    // },
    {
      label: tx('delete_message_desktop'),
      action: deleteMessage.bind(null, message.msg, chatStoreDispatch),
    },
  ]
}

const Message = (props: {
  conversationType: 'group' | 'direct'
  message: MessageType
  /* onRetrySend */
}) => {
  const { conversationType, message } = props
  const {
    id,
    direction,
    status,
    viewType,
    text,
    hasLocation,
    attachment,
    isSetupmessage,
  } = message.msg
  const tx = useTranslationFunction()

  const screenContext = useContext(ScreenContext)
  const { openContextMenu, openDialog } = screenContext
  const { chatStoreDispatch } = useChatStore2()

  const showMenu: (
    event: React.MouseEvent<HTMLDivElement | HTMLAnchorElement, MouseEvent>
  ) => void = event => {
    const link: string = (event.target as any).href || ''
    const items = buildContextMenu(
      {
        attachment,
        direction,
        status,
        message,
        text,
      },
      link,
      chatStoreDispatch
    )
    const [cursorX, cursorY] = [event.clientX, event.clientY]

    openContextMenu({
      cursorX,
      cursorY,
      items,
    })
  }

  // Info Message
  if (message.isInfo)
    return (
      <div className='info-message' onContextMenu={showMenu}>
        <p>
          {text}
          {direction === 'outgoing' &&
            (status === 'sending' || status === 'error') && (
              <div
                className={classNames('status-icon', status)}
                aria-label={tx(`a11y_delivery_status_${status}`)}
              />
            )}
        </p>
      </div>
    )

  // Normal Message
  const onContactClick = async (contact: DCContact) => {
    openViewProfileDialog(screenContext, contact.id)
  }

  let onClickMessageBody
  const isDeadDrop = message.msg.chatId === C.DC_CHAT_ID_DEADDROP
  if (isSetupmessage) {
    onClickMessageBody = () =>
      openDialog('EnterAutocryptSetupMessage', { message })
  } else if (isDeadDrop) {
    onClickMessageBody = () => {
      openDialog('DeadDrop', message)
    }
  }

  const menu = InlineMenu(showMenu, attachment, message, viewType)

  let content
  if (message.msg.viewType === C.DC_MSG_VIDEOCHAT_INVITATION) {
    content = (
      <div dir='auto' className='text'>
        <div className='call-inc-text'>
          <b>{tx('videochat_invitation')}</b>
          <div>
            <button
              className='phone-accept-button'
              onClick={joinCall.bind(null, screenContext, id)}
            >
              {direction === 'incoming' ? tx('join') : tx('rejoin')}
            </button>
          </div>
          {message.msg.videochatType === C.DC_VIDEOCHATTYPE_UNKNOWN &&
            tx('videochat_will_open_in_your_browser')}
        </div>
      </div>
    )
  } else {
    content = (
      <div dir='auto' className='text'>
        {message.msg.isSetupmessage ? (
          tx('autocrypt_asm_click_body')
        ) : (
          <MessageBody text={text || ''} />
        )}
      </div>
    )
  }

  // TODO another check - don't check it only over string
  const longMessage = /\[.{3}\]$/.test(text)

  const hasQoute = message.msg.quotedText !== null

  return (
    <div
      onContextMenu={showMenu}
      className={classNames(
        'message',
        direction,
        { 'type-sticker': viewType === 23 },
        { error: status === 'error' },
        { forwarded: message.msg.isForwarded }
      )}
    >
      {conversationType === 'group' &&
        direction === 'incoming' &&
        Avatar(message.contact, onContactClick)}
      {menu}
      <div onContextMenu={showMenu} className='msg-container'>
        {message.msg.isForwarded && (
          <div className='forwarded-indicator'>{tx('forwarded_message')}</div>
        )}
        {direction === 'incoming' &&
          conversationType === 'group' &&
          Author(message.contact, onContactClick)}
        <div
          className={classNames('msg-body', {
            'msg-body--clickable': onClickMessageBody,
          })}
          onClick={onClickMessageBody}
        >
          {hasQoute && (
            <Qoute
              quotedText={message.msg.quotedText}
              quotedMessageId={message.msg.quotedMessageId}
            />
          )}
          {attachment && !isSetupmessage && (
            <Attachment
              {...{
                attachment,
                text,
                conversationType,
                direction,
                message,
              }}
            />
          )}
          {content}
          {longMessage && (
            <button onClick={openMessageInfo.bind(null, message)}>...</button>
          )}
          <MessageMetaData
            attachment={!isSetupmessage && attachment}
            direction={direction}
            status={status}
            text={text}
            hasLocation={hasLocation}
            timestamp={message.msg.sentAt}
            padlock={message.msg.showPadlock}
          />
        </div>
      </div>
    </div>
  )
}

export default Message

const Qoute = ({
  quotedText,
  quotedMessageId,
}: {
  quotedText: string | null
  quotedMessageId: number
}) => {
  const [message, setMessage] = useState<MessageType>(null)

  useEffect(() => {
    if (quotedMessageId) {
      DeltaBackend.call('messageList.getMessage', quotedMessageId).then(msg => {
        if (msg.msg !== null) {
          setMessage(msg as MessageType)
        }
      })
    }
  }, [quotedMessageId])

  if (quotedMessageId !== 0 && message) {
    return (
      <div
        className='qoute has-message'
        style={{ borderLeftColor: message.contact.color }}
      >
        <div className='qoute-author' style={{ color: message.contact.color }}>
          {message.contact.displayName}
        </div>
        <p>{quotedText}</p>
      </div>
    )
  } else {
    return (
      <div className='qoute'>
        <p>{quotedText}</p>
      </div>
    )
  }
}

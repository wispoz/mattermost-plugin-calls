import {ChannelMembership} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {NotificationLevel} from 'mattermost-redux/constants/channels';
import {getChannel, getMyChannelMember} from 'mattermost-redux/selectors/entities/channels';
import {getServerVersion} from 'mattermost-redux/selectors/entities/general';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentUser, getUser, makeGetProfilesInChannel} from 'mattermost-redux/selectors/entities/users';
import {isChannelMuted} from 'mattermost-redux/utils/channel_utils';
import {isMinimumServerVersion} from 'mattermost-redux/utils/helpers';
import {displayUsername} from 'mattermost-redux/utils/user_utils';
import {useEffect} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector, useStore} from 'react-redux';

import {DID_NOTIFY_FOR_CALL, DID_RING_FOR_CALL} from 'src/action_types';
import {dismissIncomingCallNotification, ringForCall, showSwitchCallModal} from 'src/actions';
import {DEFAULT_RING_SOUND} from 'src/constants';
import {logDebug} from 'src/log';
import {
    connectedChannelID,
    currentlyRinging,
    didNotifyForCall,
    didRingForCall,
    getStatusForCurrentUser,
    ringingForCall,
} from 'src/selectors';
import {ChannelType, IncomingCallNotification, UserStatuses} from 'src/types/types';
import {desktopGTE, getChannelURL, isDesktopApp, sendDesktopEvent, shouldRenderDesktopWidget, split} from 'src/utils';
import {notificationSounds, sendDesktopNotificationToMe} from 'src/webapp_globals';

export const useDismissJoin = (channelID: string, callID: string) => {
    const store = useStore();
    const dispatch = useDispatch();
    const connectedID = useSelector(connectedChannelID) || '';
    const global = isDesktopApp();

    const onDismiss = () => {
        dispatch(dismissIncomingCallNotification(channelID, callID));
    };

    const onJoin = () => {
        notificationSounds?.stopRing(); // Stop ringing for _any_ incoming call.

        if (connectedID) {
            // Note: notification will be dismissed from the SwitchCallModal
            if (global && desktopGTE(5, 5)) {
                logDebug('sending calls-join-request message to desktop app');
                sendDesktopEvent('calls-join-request', {
                    callID: channelID,
                });
                return;
            }
            if (global) {
                logDebug('sending calls-widget-channel-link-click and calls-joined-call message to desktop app');
                const currentChannel = getChannel(store.getState(), connectedID);
                const channelURL = getChannelURL(store.getState(), currentChannel, currentChannel.team_id);
                sendDesktopEvent('calls-widget-channel-link-click', {pathName: channelURL});
                sendDesktopEvent('calls-joined-call', {
                    type: 'calls-join-request',
                    callID: channelID,
                });
                return;
            }

            dispatch(showSwitchCallModal(channelID));
            return;
        }

        // We weren't connected, so dismiss the notification here.
        dispatch(dismissIncomingCallNotification(channelID, callID));
        window.postMessage({type: 'connectCall', channelID}, window.origin);
    };

    return [onDismiss, onJoin];
};

export const useOnACallWithoutGlobalWidget = () => {
    const connectedChannel = useSelector(connectedChannelID);
    return Boolean(connectedChannel && !shouldRenderDesktopWidget());
};

const getNotificationSoundFromChannelMemberAndUser = (member: ChannelMembership | null | undefined, user: UserProfile) => {
    // @ts-ignore We're using an outdated webapp
    if (member?.notify_props?.desktop_notification_sound) {
        // @ts-ignore same
        return member.notify_props.desktop_notification_sound;
    }

    // @ts-ignore same
    return user.notify_props?.desktop_notification_sound ? user.notify_props.desktop_notification_sound : 'Bing';
};

const getDesktopSoundFromChannelMemberAndUser = (member: ChannelMembership | null | undefined, user: UserProfile) => {
    // @ts-ignore We're using an outdated webapp
    if (member?.notify_props?.desktop_sound) {
        // @ts-ignore We're using an outdated webapp
        if (member.notify_props.desktop_sound === 'off') {
            return false;
        }
    }

    return !user.notify_props || user.notify_props.desktop_sound === 'true';
};

const getRingingFromUser = (user: UserProfile) => {
    // @ts-ignore We're using an outdated webapp
    const callsRing = !user.notify_props || (user.notify_props.calls_desktop_sound || 'true') === 'true'; // default true if not set
    return !user.notify_props || (callsRing && user.notify_props.desktop !== NotificationLevel.NONE);
};

const getDesktopNotification = (member: ChannelMembership | null | undefined, user: UserProfile) => {
    // @ts-ignore We're using an outdated webapp
    if (member?.notify_props?.desktop_sound) {
        // @ts-ignore We're using an outdated webapp
        if (member.notify_props.desktop === NotificationLevel.NONE) {
            return false;
        }
    }

    return !user.notify_props || user.notify_props.desktop !== NotificationLevel.NONE;
};

// useNotificationSettings returns [shouldRing, shouldDesktopNotificationSound, shouldDesktopNotification]
const useNotificationSettings = (channelID: string, user: UserProfile) => {
    const status = useSelector(getStatusForCurrentUser);
    const member = useSelector((state: GlobalState) => getMyChannelMember(state, channelID));
    const muted = !member || isChannelMuted(member) || status === UserStatuses.DND || status === UserStatuses.OUT_OF_OFFICE;
    const ring = !muted && getRingingFromUser(user);
    const desktopSoundEnabled = getDesktopSoundFromChannelMemberAndUser(member, user);
    const desktopNotificationEnabled = getDesktopNotification(member, user);
    return [!muted && ring, !muted && desktopSoundEnabled, !muted && desktopNotificationEnabled];
};

export const useRingingAndNotification = (call: IncomingCallNotification, onWidget: boolean) => {
    const dispatch = useDispatch();
    const currentUser = useSelector(getCurrentUser);
    const didRing = useSelector((state: GlobalState) => didRingForCall(state, call.callID));
    const [shouldRing] = useNotificationSettings(call.channelID, currentUser);
    const currRinging = useSelector(currentlyRinging);
    const currRingingForThisCall = useSelector((state: GlobalState) => ringingForCall(state, call.callID));
    const connected = Boolean(useSelector(connectedChannelID));
    useNotification(call);

    useEffect(() => {
        // If we're on a call, or currently ringing for a different call, then never ring for this call in the future.
        if (connected || (currRinging && !currRingingForThisCall)) {
            dispatch({
                type: DID_RING_FOR_CALL,
                data: {
                    callID: call.callID,
                },
            });
            return;
        }

        // If we're on the desktopWidget then don't ring because the ringing will be handled by the main webapp.
        const ringHandledByWebapp = onWidget && shouldRenderDesktopWidget();

        // @ts-ignore Our mattermost import is old and at the moment un-updatable.
        if (!shouldRing || didRing || ringHandledByWebapp) {
            return;
        }

        // @ts-ignore same
        dispatch(ringForCall(call.callID, currentUser.notify_props.calls_notification_sound || DEFAULT_RING_SOUND));
    }, []);
};

export const useNotification = (call: IncomingCallNotification) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const channel = useSelector((state: GlobalState) => getChannel(state, call.channelID));
    const currentUser = useSelector(getCurrentUser);
    const myChannelMember = useSelector((state: GlobalState) => getMyChannelMember(state, call.channelID));
    const url = useSelector((state: GlobalState) => getChannelURL(state, channel, channel.team_id));
    const didNotify = useSelector((state: GlobalState) => didNotifyForCall(state, call.callID));
    const [_, shouldDesktopNotificationSound, shouldDesktopNotification] = useNotificationSettings(call.channelID, currentUser);
    const serverVersion = useSelector(getServerVersion);
    const [callerName, others] = useGetCallerNameAndOthers(call, 2);

    const title = others.length === 0 ? callerName : others;
    const body = formatMessage({defaultMessage: '{callerName} is inviting you to a call'}, {callerName});

    useEffect(() => {
        if (shouldDesktopNotification && !didNotify && document.visibilityState === 'hidden') {
            if (sendDesktopNotificationToMe) {
                if (call.type === ChannelType.DM && !isMinimumServerVersion(serverVersion, 8, 1)) {
                    // MM <8.1 will send its own generic channel notification for DMs
                    return;
                }
                const soundName = getNotificationSoundFromChannelMemberAndUser(myChannelMember, currentUser);
                dispatch(sendDesktopNotificationToMe(title, body, channel, channel.team_id, !shouldDesktopNotificationSound, soundName, url));
            }
        }

        // record DID_NOTIFY regardless, because we don't want to notify after the first appearance of this call
        dispatch({
            type: DID_NOTIFY_FOR_CALL,
            data: {
                callID: call.callID,
            },
        });
    }, []);
};

export const useGetCallerNameAndOthers = (call: IncomingCallNotification, splitAt: number) => {
    const {formatMessage, formatList} = useIntl();
    const teammateNameDisplay = useSelector(getTeammateNameDisplaySetting);
    const caller = useSelector((state: GlobalState) => getUser(state, call.callerID));
    const currentUser = useSelector(getCurrentUser);
    const doGetProfilesInChannel = makeGetProfilesInChannel();
    const gmMembers = useSelector((state: GlobalState) => doGetProfilesInChannel(state, call.channelID));
    const callerName = displayUsername(caller, teammateNameDisplay, false);

    let others = '';
    if (call.type === ChannelType.GM) {
        const otherMembers = gmMembers.filter((u) => u.id !== caller.id && u.id !== currentUser.id);
        const [displayed, overflowed] = split(otherMembers, splitAt);
        const users = displayed.map((u) => displayUsername(u, teammateNameDisplay));
        if (overflowed) {
            users.push(formatMessage({defaultMessage: '{num, plural, one {# other} other {# others}}'},
                {num: overflowed.length}));
        }
        others = formatList(users);
    }

    return [callerName, others];
};

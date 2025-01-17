import {GlobalState} from '@mattermost/types/store';
import {Client4} from 'mattermost-redux/client';
import {
    getUser,
} from 'mattermost-redux/selectors/entities/users';
import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useSelector} from 'react-redux';

import styled from 'styled-components';

import {useDismissJoin, useGetCallerNameAndOthers, useRingingAndNotification} from 'src/components/incoming_calls/hooks';
import Avatar from 'src/components/avatar/avatar';
import {Button} from 'src/components/buttons';
import CompassIcon from 'src/components/icons/compassIcon';
import {ChannelType, IncomingCallNotification} from 'src/types/types';

type Props = {
    call: IncomingCallNotification;
};

export const CallIncoming = ({call}: Props) => {
    const {formatMessage} = useIntl();
    const [onDismiss, onJoin] = useDismissJoin(call.channelID, call.callID);
    useRingingAndNotification(call, false);
    const caller = useSelector((state: GlobalState) => getUser(state, call.callerID));
    const [callerName, others] = useGetCallerNameAndOthers(call, 2);

    let message;
    if (call.type === ChannelType.DM) {
        message = (
            <FormattedMessage
                defaultMessage={'<b>{callerName}</b> is inviting you to a call'}
                values={{
                    b: (text: string) => <b>{text}</b>,
                    callerName,
                }}
            />
        );
    } else if (call.type === ChannelType.GM) {
        message = (
            <FormattedMessage
                defaultMessage={'<b>{callerName}</b> is inviting you to a call with <b>{others}</b>'}
                values={{
                    b: (text: string) => <b>{text}</b>,
                    callerName,
                    others,
                }}
            />
        );
    }

    return (
        <Container>
            <Inner>
                <Row>
                    <Avatar
                        url={Client4.getProfilePictureUrl(caller.id, caller.last_picture_update)}
                        border={false}
                    />
                    <Message>
                        {message}
                    </Message>
                </Row>
                <RowSpaced>
                    <WideButton
                        onClick={onDismiss}
                        css={'margin-right: 8px'}
                    >
                        <CompassIcon
                            icon={'close'}
                            css={'margin-right: 2px'}
                        />
                        {formatMessage({defaultMessage: 'Ignore'})}
                    </WideButton>
                    <JoinButton onClick={onJoin}>
                        <CompassIcon
                            icon={'phone-in-talk'}
                            css={'margin-right: 5px'}
                        />
                        {formatMessage({defaultMessage: 'Join'})}
                    </JoinButton>
                </RowSpaced>
            </Inner>
        </Container>
    );
};

const Container = styled.div`
    border-radius: 8px;
    background-color: var(--online-indicator);
`;

const Inner = styled.div`
    width: 100%;
    height: 100%;
    padding: 8px;
    font-weight: 400;
    font-size: 14px;
    line-height: 20px;
    background-color: rgba(0, 0, 0, 0.16);
`;

const Row = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
`;

const Message = styled.div`
    color: var(--button-color);
    margin: -3px 4px 0 10px;
`;

const RowSpaced = styled(Row)`
    justify-content: space-around;
    margin-top: 12px;
`;

const WideButton = styled(Button)`
    flex: 1;
    max-width: 126px;
    justify-content: center;
    padding: 0 16px;

    background-color: rgba(var(--button-color-rgb), 0.12);
    color: var(--button-color);

    &:hover {
        background-color: rgba(var(--button-color-rgb), 0.16);
    }
`;

const JoinButton = styled(WideButton)`
    background-color: var(--button-color);
    color: var(--online-indicator);

    &:hover {
        background-color: rgba(var(--button-color-rgb), 0.88);
    }
`;

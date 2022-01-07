import {test, expect, chromium} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {userState} from '../constants';

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('start new call', () => {
    test.use({storageState: userState.users[0].storageStatePath});

    test('channel header button', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);
        expect(await page.locator('#calls-widget .calls-widget-bottom-bar').screenshot()).toMatchSnapshot('calls-widget-bottom-bar.png');
        await devPage.leaveCall();
    });

    test('slash command', async ({page, context}) => {
        await page.locator('#post_textbox').fill('/call join');
        await page.locator('#post_textbox').press('Enter');
        await page.locator('#post_textbox').press('Enter');
        await expect(page.locator('#calls-widget')).toBeVisible();
        await page.locator('#post_textbox').fill('/call leave');
        await page.locator('#post_textbox').press('Enter');
        await page.locator('#post_textbox').press('Enter');
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('dm channel', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.gotoDM(userState.users[1].username);
        await devPage.startCall();
        await devPage.wait(1000);
        expect(await page.locator('#calls-widget .calls-widget-bottom-bar').screenshot()).toMatchSnapshot('calls-widget-bottom-bar-dm.png');
        await devPage.leaveCall();
    });
});

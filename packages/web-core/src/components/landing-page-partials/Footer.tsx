import { Link } from 'react-router-dom';
import Logo from '../../assets/logo.svg';
import { useTranslation } from 'react-i18next';
import './footer.scss';
import { Button } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { UILocaleList } from '@refly-packages/ai-workspace-common/components/ui-locale-list';
import {
  IconX,
  IconGithub,
  IconDiscord,
  IconEmail,
  IconLanguage,
} from '@refly-packages/ai-workspace-common/components/common/icon';
import { EXTENSION_DOWNLOAD_LINK, getClientOrigin } from '@refly/utils';

const resources = [
  {
    title: 'docs',
    link: 'https://docs.refly.ai',
  },
  {
    title: 'twitter',
    link: 'https://twitter.com/reflyai',
  },
  {
    title: 'github',
    link: 'https://github.com/refly-ai',
  },
  {
    title: 'discord',
    link: 'https://discord.gg/bWjffrb89h',
  },
];

const platforms = [
  {
    title: 'chrome',
    link: EXTENSION_DOWNLOAD_LINK,
  },
  {
    title: 'web',
    link: getClientOrigin(),
  },
];

function Footer() {
  const { t } = useTranslation();

  // Add scroll to top function
  const scrollToTop = (e: React.MouseEvent) => {
    e.preventDefault();
    const elem = document.querySelector('.scroll-tag');
    if (elem?.scrollIntoView) {
      elem?.scrollIntoView?.({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="px-6">
      <div className="py-12 md:py-16">
        <div className="mx-auto w-full max-w-7xl md:w-[70%]">
          {/* Main Footer Content */}
          <div className="w-full rounded-[20px] border border-[#E3E3E3] p-8 md:p-12 bg-gray-100 dark:bg-gray-700">
            {/* Updated Footer Layout - Changed grid columns ratio */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[40%_1fr]">
              {/* Left Column - Logo, Description, Social */}
              <div className="w-full">
                <Link to="/" className="mb-4 inline-block no-underline" aria-label="Refly">
                  <div className="flex items-center gap-2">
                    <img src={Logo} alt="" className="h-8 w-8" />
                    <span className="text-xl font-bold text-black dark:text-gray-100">Refly</span>
                  </div>
                </Link>
                <p className="mb-6 max-w-[320px] text-base leading-relaxed text-gray-600 dark:text-gray-300">
                  {t('landingPage.anotherDescription')}
                </p>
                <div className="flex items-center justify-start gap-3">
                  {/* Social Media Links */}
                  <div className="flex items-center gap-2">
                    <Link
                      to="https://twitter.com/reflyai"
                      target="_blank"
                      className="rounded-md px-2 py-1 text-gray-500 no-underline transition hover:text-gray-700"
                      aria-label="Twitter"
                    >
                      <IconX className="flex items-center text-base" />
                    </Link>
                    <Link
                      to="https://github.com/refly-ai"
                      target="_blank"
                      className="rounded-md px-2 py-1 text-gray-500 no-underline transition hover:text-gray-700"
                      aria-label="GitHub"
                    >
                      <IconGithub className="flex items-center text-base" />
                    </Link>
                    <Link
                      to="https://discord.gg/bWjffrb89h"
                      target="_blank"
                      className="rounded-md px-2 py-1 text-gray-500 no-underline transition hover:text-gray-700"
                      aria-label="Discord"
                    >
                      <IconDiscord className="flex items-center text-base" />
                    </Link>
                    <Link
                      to="mailto:support@refly.ai"
                      target="_blank"
                      className="rounded-md px-2 py-1 text-gray-500 no-underline transition hover:text-gray-700"
                      aria-label="Discord"
                    >
                      <IconEmail className="flex items-center text-base" />
                    </Link>
                  </div>

                  {/* Divider */}
                  <div className="h-4 w-[1px] bg-gray-200 dark:bg-gray-600" />

                  {/* Language Selector */}
                  <div className="flex cursor-pointer items-center text-gray-600 hover:text-green-600 dark:text-gray-300 dark:hover:text-green-300">
                    <UILocaleList>
                      <Button
                        type="text"
                        size="middle"
                        className="px-2 text-gray-600 hover:text-green-600 dark:text-gray-300 dark:hover:text-green-300 "
                      >
                        <IconLanguage className="h-4 w-4" />
                        {t('language')}{' '}
                        <DownOutlined className="ml-1 transition-transform duration-200 group-hover:rotate-180" />
                      </Button>
                    </UILocaleList>
                  </div>
                </div>
                <div className="mt-6">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    © {new Date().getFullYear()} Powerformer, Inc.
                  </p>
                </div>
              </div>

              {/* Right Column - Navigation Links */}
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                {/* First Column */}
                <div className="grid auto-rows-min content-start gap-8">
                  {/* Products Section */}
                  <div>
                    <h6 className="mb-1 text-[14px] font-medium">
                      {t('landingPage.footer.product.title')}
                    </h6>
                    <ul className="list-none text-sm">
                      {t('landingPage.footer.product.list', {
                        returnObjects: true,
                      })?.map((item: string, index: number) => (
                        <li key={index} className="mb-1">
                          <Link
                            to="#"
                            onClick={scrollToTop}
                            className="text-gray-500 no-underline transition duration-150 ease-in-out hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                          >
                            {item}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Resources Section */}
                  <div>
                    <h6 className="mb-1 text-[14px] font-medium">
                      {t('landingPage.footer.resource.title')}
                    </h6>
                    <ul className="list-none text-sm">
                      {resources.map((item, index) => (
                        <li key={index} className="mb-1">
                          <Link
                            to={item.link}
                            target="_blank"
                            className="text-gray-500 no-underline transition duration-150 ease-in-out hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                          >
                            {t(`landingPage.footer.resource.${item.title}`)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Second Column */}
                <div className="grid auto-rows-min content-start gap-8">
                  {/* About Section */}
                  <div>
                    <h6 className="mb-1 text-[14px] font-medium">
                      {t('landingPage.footer.about.title')}
                    </h6>
                    <ul className="list-none text-sm">
                      <li key="privacy" className="mb-1">
                        <Link
                          to="https://docs.refly.ai/about/privacy-policy"
                          target="_blank"
                          className="text-gray-500 no-underline transition duration-150 ease-in-out hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          {t('landingPage.footer.about.privacy')}
                        </Link>
                      </li>
                      <li key="terms" className="mb-1">
                        <Link
                          to="https://docs.refly.ai/about/terms-of-service"
                          target="_blank"
                          className="text-gray-500 no-underline transition duration-150 ease-in-out hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          {t('landingPage.footer.about.terms')}
                        </Link>
                      </li>
                    </ul>
                  </div>

                  {/* Platforms Section */}
                  <div>
                    <h6 className="mb-1 text-[14px] font-medium">
                      {t('landingPage.footer.platforms.title')}
                    </h6>
                    <ul className="list-none text-sm">
                      {platforms.map((item) => (
                        <li key={item.title} className="mb-1">
                          <Link
                            to={item.link}
                            target="_blank"
                            className="text-gray-500 no-underline transition duration-150 ease-in-out hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                          >
                            {t(`landingPage.footer.platforms.${item.title}`)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Contact Us Section */}
                  <div>
                    <h6 className="mb-1 text-[14px] font-medium">
                      {t('landingPage.footer.contactUs.title')}
                    </h6>
                    <ul className="list-none text-sm">
                      <li key="community" className="mb-1">
                        <Link
                          to="https://docs.refly.ai/community/contact-us"
                          target="_blank"
                          className="text-gray-500 no-underline transition duration-150 ease-in-out hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          {t('landingPage.footer.contactUs.community')}
                        </Link>
                      </li>
                      <li key="mail" className="mb-1">
                        <Link
                          to={'mailto:support@refly.ai'}
                          className="text-gray-500 no-underline transition duration-150 ease-in-out hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          {t('landingPage.footer.contactUs.mail')}
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;

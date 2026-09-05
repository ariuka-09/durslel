ALTER TABLE `users` ADD `subscription` text DEFAULT 'FREE' NOT NULL;
ALTER TABLE `users` ADD `subscription_until` integer;
ALTER TABLE `users` ADD `subscription_payment` text;
export const core = {
  "Checking your existing versions before saving":
    "Vérification des versions existantes avant l’enregistrement",
  "Saving setup is already running for this folder.":
    "La configuration de l’enregistrement est déjà en cours pour ce dossier.",
  "Wait for it to finish, then try again.": "Attendez qu’elle se termine, puis réessayez.",
  "Saving setup needs a local check before it can continue.":
    "La configuration de l’enregistrement nécessite une vérification locale avant de continuer.",
  "Ask Claude to check the interrupted saving setup on this computer, then try again. Your files are unchanged.":
    "Demandez à Claude de vérifier la configuration interrompue sur cet ordinateur, puis réessayez. Vos fichiers sont inchangés.",
  "Review this app's existing versions before creating its private copy.":
    "Vérifiez les versions existantes de cette application avant de créer sa copie privée.",
  "Open Set up saving again and confirm that these versions should be kept.":
    "Rouvrez Configurer l’enregistrement et confirmez que ces versions doivent être conservées.",
  "Earlier versions contain files that must stay on this computer.":
    "Des versions précédentes contiennent des fichiers qui doivent rester sur cet ordinateur.",
  "Ask Claude to inspect these versions. Nothing was sent and the history was not changed.":
    "Demandez à Claude d’examiner ces versions. Rien n’a été envoyé et l’historique n’a pas été modifié.",
  "A secret key is in an earlier version of this app.":
    "Une version précédente de cette application contient une clé secrète.",
  "Saving needs Git to work on this computer.":
    "Git doit fonctionner sur cet ordinateur pour permettre l’enregistrement.",
  "Run `xcode-select --install`, finish Apple's installation, then check again.":
    "Exécutez `xcode-select --install`, terminez l’installation Apple, puis vérifiez à nouveau.",
  "Ask Claude to check Git on this computer, then press Check again.":
    "Demandez à Claude de vérifier Git sur cet ordinateur, puis cliquez sur Vérifier à nouveau.",

  "Clodable's settings file can't be read.":
    "Impossible de lire le fichier de paramètres de Clodable.",
  "Ask Claude to check {0} for a typo and fix it.":
    "Demandez à Claude de vérifier {0} et de corriger l’erreur de saisie.",
  "Clodable's settings file has a value it doesn't understand.":
    "Le fichier de paramètres de Clodable contient une valeur non reconnue.",
  "Ask Claude to check {0} and fix that value.":
    "Demandez à Claude de vérifier {0} et de corriger cette valeur.",
  "Lovable owns this database: it can't be changed from here.":
    "Cette base de données appartient à Lovable : elle ne peut pas être modifiée ici.",
  "Moving off Lovable gives your app a database of its own.":
    "Quitter Lovable permet à votre application d’avoir sa propre base de données.",
  "This app has no Supabase database Clodable knows of.":
    "Clodable ne connaît aucune base de données Supabase pour cette application.",
  "Its Supabase project goes in .clodable/config.json, under supabase.projectRef.":
    "Indiquez son projet Supabase dans .clodable/config.json, sous supabase.projectRef.",
  "Supabase isn't connected on this computer.": "Supabase n’est pas connecté sur cet ordinateur.",
  "Connect your Supabase account in the Clodable panel: changes to your database go through it.":
    "Connectez votre compte Supabase dans le panneau Clodable pour modifier votre base de données.",
  "Which query?": "Quelle requête ?",
  "Only a query that reads goes here.": "Seules les requêtes en lecture sont acceptées ici.",
  "To change data: clodable db run. To change the tables: a migration, with clodable db apply.":
    "Pour modifier les données : clodable db run. Pour modifier les tables : une migration avec clodable db apply.",
  "That changes the tables: it goes in a migration.":
    "Cette opération modifie les tables : utilisez une migration.",
  "Write it to supabase/migrations/<timestamp>_<what>.sql, then clodable db apply that file.":
    "Écrivez-la dans supabase/migrations/<timestamp>_<what>.sql, puis appliquez ce fichier avec clodable db apply.",
  "Which migration?": "Quelle migration ?",
  "A file in supabase/migrations/, named <timestamp>_<what>.sql.":
    "Un fichier dans supabase/migrations/, nommé <timestamp>_<what>.sql.",
  "There's no {0}.": "{0} est introuvable.",
  "You have unsaved changes outside your draft.":
    "Des modifications non enregistrées se trouvent en dehors de votre brouillon.",
  "Save them first, or switch to your draft manually.":
    "Enregistrez-les d’abord, ou revenez manuellement à votre brouillon.",
  "Your draft is in the middle of being combined with the live site.":
    "Votre brouillon est en cours de combinaison avec le site en ligne.",
  "Ask Claude to finish combining the changes, then save again.":
    "Demandez à Claude de terminer la combinaison des modifications, puis enregistrez à nouveau.",
  "A secret key is in {0}": "Une clé secrète se trouve dans {0}",
  "{0} secret keys are in your changes": "Vos modifications contiennent {0} clés secrètes",
  "Nothing went to GitHub. Ask Claude to move it out of the code, and it saves.":
    "Rien n’a été envoyé à GitHub. Demandez à Claude de retirer la clé du code pour permettre l’enregistrement.",
  "GitHub didn't accept your changes.": "GitHub n’a pas accepté vos modifications.",
  "Check that your GitHub account can write to this repository.":
    "Vérifiez que votre compte GitHub peut modifier ce dépôt.",
  "That version couldn't be found.": "Cette version est introuvable.",
  "Something unexpected went wrong.": "Un problème inattendu est survenu.",
  "Try again. If it keeps happening, share the details with your developer.":
    "Réessayez. Si le problème persiste, transmettez les détails à votre développeur.",
  "Saving needs to know who you are.": "Connectez votre compte pour enregistrer.",
  "Type /clodable to open the Clodable panel and connect your GitHub account there. Your changes stay on this computer meanwhile.":
    "Tapez /clodable pour ouvrir le panneau Clodable et y connecter votre compte GitHub. En attendant, vos modifications restent sur cet ordinateur.",
  "Your changes couldn't be saved.": "Vos modifications n’ont pas pu être enregistrées.",
  "Your draft couldn't be compared with the live site.":
    "Votre brouillon n’a pas pu être comparé au site en ligne.",
  "Your draft couldn't be brought up to date.": "Votre brouillon n’a pas pu être mis à jour.",
  "Give your app a short name using letters, numbers or dashes.":
    "Donnez à votre application un nom court composé de lettres, de chiffres ou de tirets.",
  "The connected GitHub account has changed.": "Le compte GitHub connecté a changé.",
  "Open Set up saving again and check the account before continuing.":
    "Ouvrez à nouveau Configurer l’enregistrement et vérifiez le compte avant de continuer.",
  "Your local app needs a little preparation before saving.":
    "Votre application locale doit être préparée avant de pouvoir être enregistrée.",
  "Ask Claude to prepare this prototype for Clodable, keeping your design and content.":
    "Demandez à Claude de préparer ce prototype pour Clodable, en conservant votre design et votre contenu.",
  "Saving was already started for a different app name or account.":
    "L’enregistrement a déjà commencé pour un autre nom d’app ou un autre compte.",
  "Continue with {0}/{1}. Your local work is still here.":
    "Continuez avec {0}/{1}. Votre travail local est toujours là.",
  "This folder already belongs to an app.": "Ce dossier appartient déjà à une application.",
  "Open Clodable to set up that app. Start a new idea in an empty folder.":
    "Ouvrez Clodable pour configurer cette application. Pour une nouvelle idée, utilisez un dossier vide.",
  "Checking your local app before saving":
    "Vérification de votre application locale avant l’enregistrement",
  "A secret key needs to stay out of your app's code.":
    "Une clé secrète doit être retirée du code de votre application.",
  "Ask Claude to move it out, then try Set up saving again. Nothing was sent to GitHub.":
    "Demandez à Claude de la retirer, puis réessayez Configurer l’enregistrement. Rien n’a été envoyé à GitHub.",
  "This GitHub connection can't create a new app.":
    "Cette connexion GitHub ne permet pas de créer une nouvelle app.",
  "Creating your private app on GitHub": "Création de votre application privée sur GitHub",
  "GitHub returned a different app than the one you approved.":
    "GitHub a renvoyé une autre app que celle que vous avez approuvée.",
  "Nothing was sent. Check your GitHub account before continuing.":
    "Rien n’a été envoyé. Vérifiez votre compte GitHub avant de continuer.",
  "This folder is connected to a different app.": "Ce dossier est connecté à une autre app.",
  "Your files are unchanged. Ask Claude to check the connection before saving.":
    "Vos fichiers sont inchangés. Demandez à Claude de vérifier la connexion avant d’enregistrer.",
  "Your private app is ready for its first save":
    "Votre application privée est prête pour son premier enregistrement",
  "This app has no Netlify site to reconnect.":
    "Cette application n’a aucun site Netlify à reconnecter.",
  "This connection doesn't match your app's hosting account.":
    "Cette connexion ne correspond pas au compte d’hébergement de votre application.",
  "Your move off Lovable puts your site on Netlify.":
    "Le transfert depuis Lovable place votre site sur Netlify.",
  "Go on with the move: its website step does this, pointed at your new backend.":
    "Continuez le transfert : l’étape du site web s’en charge et le relie à votre nouveau backend.",
  "Setting up hosting": "Configuration de l’hébergement",
  "Creating your site on Netlify": "Création de votre site sur Netlify",
  "Giving it your app's settings": "Application des paramètres de votre application",
  "Setting up Publish": "Configuration de la publication",
  "Your site is ready": "Votre site est prêt",
  "Publish to put it online at {0}": "Publiez pour le mettre en ligne à l’adresse {0}",
  "Your app's data is on Lovable Cloud.":
    "Les données de votre application sont sur Lovable Cloud.",
  "Moving off Lovable gives your app its own Supabase, with your data and your people.":
    "Quitter Lovable donne à votre application son propre Supabase, avec vos données et vos utilisateurs.",
  "Your app already has its own backend on Supabase.":
    "Votre application possède déjà son propre backend sur Supabase.",
  "Creating your backend": "Création de votre backend",
  "Your Supabase account already runs its 2 free projects.":
    "Votre compte Supabase utilise déjà ses 2 projets gratuits.",
  "Pause one in Supabase ({0}), or pick an organization on a paid plan, then try again.":
    "Mettez-en un en pause dans Supabase ({0}), ou choisissez une organisation avec un forfait payant, puis réessayez.",
  "Which part of the world should your backend run in?":
    "Dans quelle région du monde voulez-vous héberger votre backend ?",
  "Pick the region closest to the people who use your app.":
    "Choisissez la région la plus proche des utilisateurs de votre application.",
  "Starting it up: about 2 minutes": "Démarrage : environ 2 minutes",
  "Connecting your app to it": "Connexion de votre application",
  "Your backend is ready": "Votre backend est prêt",
  "Which Supabase organization should your backend go in?":
    "Dans quelle organisation Supabase voulez-vous créer votre backend ?",
  "Pick one: {0}.": "Choisissez une option : {0}.",
  "Updating {0} backend function{1}": "Mise à jour de {0} fonction{1} backend",
  "Backend functions need one more step":
    "Une dernière étape est nécessaire pour les fonctions backend",
  "Backend functions updated": "Fonctions backend mises à jour",
  "Some backend functions need attention": "Certaines fonctions backend demandent votre attention",
  "Function {0}: {1}": "Fonction {0} : {1}",
  "Saving your latest changes": "Enregistrement de vos dernières modifications",
  "Couldn't check your changes for secret keys":
    "Impossible de vérifier la présence de clés secrètes dans vos modifications",
  "Couldn't check your changes for secret keys, so nothing was sent.":
    "Impossible de vérifier la présence de clés secrètes dans vos modifications. Rien n’a été envoyé.",
  "Check your internet connection and try again. Nothing went live.":
    "Vérifiez votre connexion internet et réessayez. Rien n’a été mis en ligne.",
  "Couldn't reach GitHub": "Impossible de joindre GitHub",
  "Your changes are saved on this computer, but GitHub can't be reached to publish them.":
    "Vos modifications sont enregistrées sur cet ordinateur, mais GitHub est inaccessible pour les publier.",
  "Check your internet connection and try again.":
    "Vérifiez votre connexion internet et réessayez.",
  "You're working directly on the live version.":
    "Vous travaillez directement sur la version en ligne.",
  "Ask Claude to move your work onto your draft, then publish again.":
    "Demandez à Claude de déplacer votre travail dans votre brouillon, puis publiez à nouveau.",
  "Saved your latest changes": "Dernières modifications enregistrées",
  "Everything was already saved": "Tout était déjà enregistré",
  "Catching up with your live site": "Récupération des mises à jour du site en ligne",
  "Your draft and the live site changed the same thing":
    "Votre brouillon et le site en ligne ont modifié le même élément",
  "Your draft and the live site both changed the same thing.":
    "Votre brouillon et le site en ligne ont modifié le même élément.",
  "Ask Claude to review both versions with you. Your preview is unchanged.":
    "Demandez à Claude de comparer les deux versions avec vous. Votre aperçu est inchangé.",
  "Ask Claude to combine them. It knows what to do. Then publish again.":
    "Demandez à Claude de les combiner, puis publiez à nouveau.",
  "GitHub didn't accept the update.": "GitHub n’a pas accepté la mise à jour.",
  "Up to date with your live site": "À jour avec votre site en ligne",
  "{0} live update{1} brought in": "{0} mise{1} à jour du site récupérée{1}",
  "Already up to date with your live site": "Déjà à jour avec votre site en ligne",
  "There's no new app change to publish.":
    "Aucune nouvelle modification de l’application à publier.",
  "This does not confirm which version visitors see. Ask Claude to check the hosting status if your site looks out of date.":
    "Cela ne confirme pas la version visible par vos visiteurs. Si votre site semble ancien, demandez à Claude de vérifier l’hébergement.",
  "Checks skipped": "Vérifications ignorées",
  "Checking everything works": "Vérification du bon fonctionnement",
  "Checks found a problem": "Un problème a été détecté",
  "Checks found {0} problems": "{0} problèmes ont été détectés",
  "Checks passed, with a note": "Vérifications réussies, avec une remarque",
  "Everything checks out": "Toutes les vérifications sont réussies",
  "Preparing your draft on GitHub": "Préparation de votre brouillon sur GitHub",
  "There's nothing new to publish.": "Rien de nouveau à publier.",
  "Draft ready on GitHub": "Brouillon prêt sur GitHub",
  Publishing: "Publication",
  "Ready for your host": "Prêt pour votre hébergeur",
  "Retrying the same version": "Nouvelle tentative avec la même version",
  "This version couldn't be retried automatically.":
    "Cette version n’a pas pu être publiée à nouveau automatiquement.",
  "Ask Claude to check the hosting report. Keep the app unchanged; don't make an edit to trigger publishing.":
    "Demandez à Claude de vérifier le rapport de l’hébergeur. Gardez l’application telle quelle : ne la modifiez pas pour relancer la publication.",
  "Starting a fresh draft": "Création d’un nouveau brouillon",
  "Fresh draft ready": "Nouveau brouillon prêt",
  "Undoing your last publish": "Annulation de votre dernière publication",
  "There's no publish to undo yet.": "Aucune publication à annuler pour le moment.",
  "This publish can't be undone automatically":
    "Cette publication ne peut pas être annulée automatiquement",
  "Newer changes on your live site touch the same lines, so this can't be undone automatically.":
    "Des modifications plus récentes du site en ligne touchent les mêmes lignes. L’annulation automatique est impossible.",
  "Ask Claude to undo it by hand. It can see exactly what changed.":
    "Demandez à Claude de l’annuler manuellement. Il peut voir précisément ce qui a changé.",
  "GitHub didn't accept the undo.": "GitHub n’a pas accepté l’annulation.",
  "Prepared the undo": "Annulation préparée",
  "Putting the previous version back": "Remise en ligne de la version précédente",
  "Previous version restored": "Version précédente rétablie",
  "“{0}” isn't a setting name.": "« {0} » n’est pas un nom de paramètre.",
  "Which setting?": "Quel paramètre ?",
  "Use capitals, digits and underscores, like GREETING.":
    "Utilisez des majuscules, des chiffres et des tirets bas, comme GREETING.",
  "That setting is empty.": "Ce paramètre est vide.",
  "Your project's checks passed": "Les vérifications de votre projet sont réussies",
  "A check failed: {0}": "Une vérification a échoué : {0}",
  "Your project's own checks didn't pass ({0}).":
    "Les vérifications de votre projet ont échoué ({0}).",
  "Nothing went live. Ask Claude to look at the failing check and fix it.":
    "Rien n’a été mis en ligne. Demandez à Claude d’examiner et de corriger la vérification en échec.",
  "Waiting for your project's checks": "En attente des vérifications de votre projet",
  "{0} of {1} finished": "{0} sur {1} terminées",
  "Your project's checks are taking too long.":
    "Les vérifications de votre projet prennent trop de temps.",
  "Nothing went live. Try publishing again in a few minutes.":
    "Rien n’a été mis en ligne. Réessayez de publier dans quelques minutes.",
  "Published on GitHub": "Publié sur GitHub",
  "To put it live, click Publish, then Publish changes, in Lovable":
    "Pour mettre le site en ligne, cliquez sur Publish, puis Publish changes dans Lovable",
  "Going live": "Mise en ligne",
  "You're live": "Votre site est en ligne",
  "Your host couldn't put it live": "Votre hébergeur n’a pas pu mettre le site en ligne",
  "Your changes are saved, but your host couldn't put them live.":
    "Vos modifications sont enregistrées, mais votre hébergeur n’a pas pu les mettre en ligne.",
  "Your previous version is still live. Fix the hosting problem, then retry Publish; no new app change is needed.":
    "La version précédente reste en ligne. Corrigez le problème d’hébergement, puis réessayez Publier, sans modifier l’application.",
  "No host puts it online from there yet":
    "Aucun hébergeur ne le met encore en ligne depuis GitHub",
  Published: "Publié",
  "Your host will put it live in a moment": "Votre hébergeur va bientôt le mettre en ligne",
  "Still going live": "Mise en ligne toujours en cours",
  "Your host is taking longer than usual": "Votre hébergeur prend plus de temps que d’habitude",
  "Updating your site on Netlify": "Mise à jour de votre site sur Netlify",
  "Your site on Netlify is up to date": "Votre site sur Netlify est à jour",
  "Your site on Netlify didn't update": "Votre site sur Netlify n’a pas été mis à jour",
  "Your site on Netlify is still updating":
    "Votre site sur Netlify est toujours en cours de mise à jour",
  "This folder isn't connected to GitHub yet.": "Ce dossier n’est pas encore connecté à GitHub.",
  "Type /clodable to open the Clodable panel and set this folder up there.":
    "Tapez /clodable pour ouvrir le panneau Clodable et y configurer ce dossier.",
  "Clodable isn't set up in this project.": "Clodable n’est pas configuré pour ce projet.",
  "Type /clodable to open the Clodable panel and set it up here. Until then, Clodable leaves this project alone.":
    "Tapez /clodable pour ouvrir le panneau Clodable et le configurer ici. Jusque-là, Clodable ne modifie pas ce projet.",
  "No build step to check": "Aucune étape de build à vérifier",
  "It builds": "Le build fonctionne",
  "A page doesn't build ({0}, line {1})": "Le build d’une page échoue ({0}, ligne {1})",
  "Your app doesn't build": "Le build de votre application échoue",
  "Package check not available for this project":
    "La vérification des dépendances n’est pas disponible pour ce projet",
  "Couldn't check packages (offline?)":
    "Impossible de vérifier les dépendances : connexion indisponible ?",
  "Couldn't check packages right now": "Impossible de vérifier les dépendances pour le moment",
  "Packages look safe": "Les dépendances semblent sûres",
  "Couldn't check for secret keys": "Impossible de vérifier la présence de clés secrètes",
  "A secret key is saved in {0}": "Une clé secrète est enregistrée dans {0}",
  "{0} secret keys are saved in your project":
    "{0} clés secrètes sont enregistrées dans votre projet",
  "Something that looks like a key is saved in your project":
    "Une valeur ressemblant à une clé est enregistrée dans votre projet",
  "No secret keys exposed": "Aucune clé secrète exposée",
  "A check failed.": "Une vérification a échoué.",
  "That app name is already in use.": "Ce nom d’app est déjà utilisé.",
  "That draft isn't open any more.": "Ce brouillon n’est plus ouvert.",
  "GitHub couldn't combine your draft with the live site.":
    "GitHub n’a pas pu combiner votre brouillon avec le site en ligne.",
  "GitHub didn't accept a request.": "GitHub n’a pas accepté une requête.",
  "Couldn't create your private app on GitHub.":
    "Impossible de créer votre application privée sur GitHub.",
  "That name may already be in use, or your account may not allow new apps. Your local work is still here. Check GitHub before trying again.":
    "Ce nom est peut-être déjà utilisé, ou votre compte ne permet pas de créer une application. Votre travail local est toujours là. Vérifiez GitHub avant de réessayer.",
  "Couldn't connect this app to your GitHub account.":
    "Impossible de connecter cette application à votre compte GitHub.",
  "Try Set up saving again.": "Réessayez Configurer l’enregistrement.",
  "The draft's page on GitHub couldn't be created.":
    "Impossible de créer la page du brouillon sur GitHub.",
  "Couldn't read the checks on GitHub.": "Impossible de lire les vérifications sur GitHub.",
  "GitHub didn't publish your draft.": "GitHub n’a pas publié votre brouillon.",
  "Your repository may require something before publishing. Open the draft on GitHub to see why.":
    "Votre dépôt exige peut-être une étape avant la publication. Ouvrez le brouillon sur GitHub pour connaître la raison.",
  "GitHub didn't accept the {0} secret your site needs to publish.":
    "GitHub n’a pas accepté le secret {0} nécessaire à la publication de votre site.",
  "Check you can change this repository's settings on GitHub, then try again.":
    "Vérifiez que vous pouvez modifier les paramètres de ce dépôt sur GitHub, puis réessayez.",
  "Clodable isn't connected to your GitHub account.":
    "Clodable n’est pas connecté à votre compte GitHub.",
  "Type /clodable to open the Clodable panel and connect it there.":
    "Tapez /clodable pour ouvrir le panneau Clodable et y connecter votre compte.",
  "GitHub can't be reached right now.": "GitHub est inaccessible pour le moment.",
  "That doesn't look like a Supabase access token.":
    "Cette valeur ne ressemble pas à un token d’accès Supabase.",
  "It starts with sbp_. Create one in Supabase: Account → Access Tokens → Generate new token.":
    "Il commence par sbp_. Créez-en un dans Supabase : Account → Access Tokens → Generate new token.",
  "Your data and users": "Vos données et vos utilisateurs",
  "Copied from Lovable's export into your own Supabase. Your users keep their accounts.":
    "Copiés depuis l’export Lovable vers votre propre Supabase. Vos utilisateurs conservent leurs comptes.",
  "Moved to your Supabase, all together.": "Transférés ensemble vers votre Supabase.",
  "You paste their values into a secure form: {0}.":
    "Collez leurs valeurs dans un formulaire sécurisé : {0}.",
  "An AI feature": "Une fonctionnalité d’IA",
  "AI features": "Fonctionnalités d’IA",
  Emails: "Emails",
  "Connected services: {0}": "Services connectés : {0}",
  "They go through Lovable's connectors. You connect your own account for each, and Claude switches the code.":
    "Ils utilisent les connecteurs de Lovable. Connectez votre propre compte pour chacun ; Claude adaptera le code.",
  "Sign in with {0}": "Connexion avec {0}",
  "{0} sign-in needs a developer account with that company. Best done with help.":
    "La connexion {0} nécessite un compte développeur auprès de ce service. Mieux vaut vous faire accompagner.",
  "You create a Google sign-in client, following the steps in the panel, and paste its ID and secret.":
    "Créez un client de connexion Google en suivant les étapes du panneau, puis collez son ID et son secret.",
  "You create your own sign-in credentials with that company: Claude explains how.":
    "Créez vos propres identifiants de connexion auprès de ce service. Claude vous explique comment.",
  "Scheduled jobs": "Tâches planifiées",
  "Moved, and pointed at your new backend.": "Transférées et reliées à votre nouveau backend.",
  "Uploaded files": "Fichiers importés",
  "Copied to your Supabase. Their size shows once you've exported your data.":
    "Copiés vers votre Supabase. Leur taille sera visible après l’export de vos données.",
  "Payments ({0})": "Paiements ({0})",
  "When you go live, you change your Stripe webhook's address to your new backend: the panel shows it.":
    "À la mise en ligne, remplacez l’adresse de votre webhook Stripe par celle du nouveau backend indiquée dans le panneau.",
  "Your website": "Votre site web",
  "Moves to Netlify (free to start), and your own domain with it. You create the account, Clodable sets it up.":
    "Transféré vers Netlify, gratuit pour commencer, avec votre domaine. Créez le compte ; Clodable s’occupe de la configuration.",
  "Lovable's link to your GitHub": "Le lien entre Lovable et votre GitHub",
  "At the very end, you turn it off in Lovable, before removing Lovable Cloud: one click.":
    "Tout à la fin, désactivez-le dans Lovable avant de supprimer Lovable Cloud : un clic suffit.",
  "Copy your data first: the preview would show an empty app.":
    "Copiez d’abord vos données : sinon, l’aperçu afficherait une application vide.",
  "Reading your export": "Lecture de votre export",
  "Clodable couldn't match an export in Downloads to this app.":
    "Clodable n’a trouvé aucun export correspondant à cette application dans Téléchargements.",
  "Download this app's export from Lovable, or tell Claude the name and location of its .zip, .backup or .dump file. Clodable won't guess between apps.":
    "Téléchargez l’export de cette application depuis Lovable, ou indiquez à Claude le nom et l’emplacement du fichier .zip, .backup ou .dump. Clodable ne choisit pas au hasard entre les apps.",
  "That export was made before the pause: it would miss what people wrote since.":
    "Cet export date d’avant la pause : les données ajoutées depuis seraient absentes.",
  "Check the pause is in place in Lovable, export again, download the new zip, then read it.":
    "Vérifiez que la pause est active dans Lovable, exportez à nouveau, téléchargez le nouveau zip, puis lancez sa lecture.",
  "Read your export": "Export lu",
  "Create your new backend first.": "Créez d’abord votre nouveau backend.",
  "It's the step before this one.": "C’est l’étape précédente.",
  "Export your data from Lovable first.": "Exportez d’abord vos données depuis Lovable.",
  "The export Clodable read is gone from this computer.":
    "L’export lu par Clodable n’est plus sur cet ordinateur.",
  "Read it again: download the export from Lovable, then run that step again.":
    "Téléchargez à nouveau l’export depuis Lovable, puis relancez sa lecture.",
  "Copying your data": "Copie de vos données",
  "Connecting to your new database": "Connexion à votre nouvelle base de données",
  "Checking everything is there": "Vérification de la copie",
  "Everything is there": "Tout est présent",
  "Some things need a look": "Certains éléments sont à vérifier",
  "Your app's API is ready": "L’API de votre application est prête",
  "Your app's API sees every table": "L’API de votre application voit toutes les tables",
  "Your app's API doesn't see some tables yet":
    "L’API de votre application ne voit pas encore certaines tables",
  "There's no copy to check yet.": "Aucune copie à vérifier pour le moment.",
  "Copy your data first.": "Copiez d’abord vos données.",
  "There's no new backend to look at yet.": "Aucun nouveau backend à examiner pour le moment.",
  "Create it first: it's an early step of the move.":
    "Créez-le d’abord : c’est une des premières étapes du transfert.",
  "Your new backend is running": "Votre nouveau backend fonctionne",
  "Your new backend is paused": "Votre nouveau backend est en pause",
  "Your new backend isn't ready yet": "Votre nouveau backend n’est pas encore prêt",
  "Sign-in links come back to your site": "Les liens de connexion ramènent vers votre site",
  "Sign-in links don't come back to your site":
    "Les liens de connexion ne ramènent pas vers votre site",
  "they go to {0}": "ils mènent vers {0}",
  "The preview can sign people in on the copy": "L’aperçu permet de se connecter à la copie",
  "Sign-ins on the copy don't come back to the preview":
    "Les connexions à la copie ne ramènent pas vers l’aperçu",
  "{0} on the copy": "{0} dans la copie",
  "last sign-up {0}, last sign-in {1} (UTC)":
    "dernière inscription : {0}, dernière connexion : {1} (UTC)",
  "Your data's checks pass": "Les vérifications de vos données sont réussies",
  "The copy noted {0} from Postgres": "Postgres a signalé {0} pendant la copie",
  "The preview uses the copy": "L’aperçu utilise la copie",
  "The preview uses your live data (on Lovable Cloud)":
    "L’aperçu utilise vos données en ligne, sur Lovable Cloud",
  "Go live on your new site first.": "Mettez d’abord votre nouveau site en ligne.",
  "Your domain moves once the app works at its Netlify address.":
    "Votre domaine sera transféré une fois que l’application fonctionnera à son adresse Netlify.",
  "“{0}” isn't a domain of your own.": "« {0} » n’est pas un domaine qui vous appartient.",
  "Which domain?": "Quel domaine ?",
  "The one your app uses, like yourapp.com or app.yourapp.com.":
    "Celui de votre application, par exemple votreapp.com ou app.votreapp.com.",
  "That doesn't look like a Resend key.": "Cette valeur ne ressemble pas à une clé Resend.",
  "It starts with re_. In Resend: API Keys → Create API Key, with Full access.":
    "Elle commence par re_. Dans Resend : API Keys → Create API Key, avec Full access.",
  "Create your new backend first: emails are sent from it.":
    "Créez d’abord votre nouveau backend : c’est lui qui envoie les emails.",
  "“{0}” isn't a domain name.": "« {0} » n’est pas un nom de domaine.",
  "Which domain should your emails come from?":
    "Quel domaine voulez-vous utiliser pour envoyer vos emails ?",
  "A domain you own, like example.com: emails will come from no-reply@ that domain.":
    "Un domaine qui vous appartient, comme example.com. Les emails partiront de no-reply@ sur ce domaine.",
  "Setting up your emails": "Configuration de vos emails",
  "From {0}": "Depuis {0}",
  "Your domain needs its email records":
    "Votre domaine a besoin de ses enregistrements DNS pour les emails",
  "Add the {0} records at your domain's provider, then check again":
    "Ajoutez les {0} enregistrements chez votre fournisseur de domaine, puis vérifiez à nouveau",
  "Connecting Resend to Supabase": "Connexion de Resend à Supabase",
  "Your emails are ready": "Vos emails sont prêts",
  "From {0}, through Resend": "Depuis {0}, via Resend",
  "That zip holds more than one database export.":
    "Ce zip contient plusieurs exports de base de données.",
  "That zip doesn't hold a database export.": "Ce zip ne contient aucun export de base de données.",
  "Choose the single .backup or .dump file for this app, or download its export again from Lovable.":
    "Choisissez le fichier .backup ou .dump de cette application, ou téléchargez à nouveau son export depuis Lovable.",
  "That export is labelled for a different Lovable app.":
    "Cet export porte le nom d’une autre app Lovable.",
  "Download this app's export, or tell Claude where you saved the correct file. Your saved copy hasn't changed.":
    "Téléchargez l’export de cette application, ou indiquez à Claude où se trouve le bon fichier. Votre copie enregistrée n’a pas changé.",
  "Couldn't open that export.": "Impossible d’ouvrir cet export.",
  "Download it again (from Lovable's email, or More → Cloud → Storage), then try again.":
    "Téléchargez-le à nouveau depuis l’email de Lovable ou More → Cloud → Storage, puis réessayez.",
  "That export is empty.": "Cet export est vide.",
  "Export your data again in Lovable, then download the new zip.":
    "Exportez à nouveau vos données dans Lovable, puis téléchargez le nouveau zip.",
  "Files, functions and secrets go into the copy, once it exists.":
    "Les fichiers, fonctions et secrets seront ajoutés à la copie une fois celle-ci créée.",
  "Clodable doesn't know which Lovable Cloud backend the files are in.":
    "Clodable ne sait pas quel backend Lovable Cloud contient les fichiers.",
  "Read your export again: it says where your files are.":
    "Relancez la lecture de votre export : il indique où sont vos fichiers.",
  "Your database has no secret called “{0}”.":
    "Votre base de données ne contient aucun secret nommé « {0} ».",
  "Which secret?": "Quel secret ?",
  "It has: {0}.": "Voici les secrets disponibles : {0}.",
  "That secret is empty.": "Ce secret est vide.",
  "“{0}” isn't a secret name Supabase accepts.":
    "« {0} » n’est pas un nom de secret accepté par Supabase.",
  "Use capitals, digits and underscores, not starting with SUPABASE_.":
    "Utilisez des majuscules, des chiffres et des tirets bas, sans commencer par SUPABASE_.",
  "The facts aren't JSON.": "Les informations ne sont pas au format JSON.",
  "Pipe one JSON object to `move facts --set`, shaped as the move skill shows.":
    "Transmettez un objet JSON à `move facts --set`, au format indiqué par le skill de transfert.",
  "The facts don't have the expected shape.": "Les informations n’ont pas la structure attendue.",
  "Fields: ai, signIn {email, google, apple, other}, appEmails, connectors, payments, scheduledJobs, uploads, notes.":
    "Champs : ai, signIn {email, google, apple, other}, appEmails, connectors, payments, scheduledJobs, uploads, notes.",
  "Copying your files": "Copie de vos fichiers",
  "Checking your files": "Vérification de vos fichiers",
  "Comparing them byte for byte": "Comparaison octet par octet",
  "Copied most of your files": "La plupart des fichiers sont copiés",
  "Copied your files": "Fichiers copiés",
  "This app has no backend functions to move.":
    "Cette application n’a aucune fonction backend à transférer.",
  "Moving your backend functions": "Transfert de vos fonctions backend",
  "{0} of {1}: {2}": "{0} sur {1} : {2}",
  "Some backend functions didn't move": "Certaines fonctions backend n’ont pas été transférées",
  "Moved your backend functions": "Fonctions backend transférées",
  "{0} running": "{0} en service",
  "That doesn't look like a Google client ID.":
    "Cette valeur ne ressemble pas à un ID client Google.",
  "It ends with .apps.googleusercontent.com.": "Il se termine par .apps.googleusercontent.com.",
  "That client secret is empty.": "Ce secret client est vide.",
  "Checking your new backend": "Vérification de votre nouveau backend",
  "Your new backend is paused.": "Votre nouveau backend est en pause.",
  "Restore it on its page in Supabase, then try this step again. Your live app hasn't changed.":
    "Réactivez-le depuis sa page Supabase, puis réessayez cette étape. Votre application en ligne n’a pas changé.",
  "Your new backend is ready": "Votre nouveau backend est prêt",
  "Creating your new backend": "Création de votre nouveau backend",
  "Which Supabase organization should it go in?":
    "Dans quelle organisation Supabase voulez-vous le créer ?",
  "Pick the region closest to your users.":
    "Choisissez la région la plus proche de vos utilisateurs.",
  "Supabase couldn't start your new backend.":
    "Supabase n’a pas pu démarrer votre nouveau backend.",
  "Delete it in Supabase, then create it again from Clodable.":
    "Supprimez-le dans Supabase, puis recréez-le depuis Clodable.",
  "Your new backend is taking unusually long to start.":
    "Votre nouveau backend met plus de temps que prévu à démarrer.",
  "Check it in Supabase, then try this step again: Clodable picks up where it was.":
    "Vérifiez-le dans Supabase, puis réessayez cette étape. Clodable reprend là où il s’était arrêté.",
  "Clodable doesn't have this backend's database password.":
    "Clodable n’a pas le mot de passe de la base de données de ce backend.",
  "Run the move from the computer that created it.":
    "Lancez le transfert depuis l’ordinateur qui l’a créé.",
  "Supabase didn't say how to connect to your new database.":
    "Supabase n’a pas indiqué comment se connecter à votre nouvelle base de données.",
  "Try again in a minute.": "Réessayez dans une minute.",
  "Couldn't reach {0}.": "Impossible de joindre {0}.",
  "Check your internet connection, then try again.":
    "Vérifiez votre connexion internet, puis réessayez.",
  "{0} answered in a way Clodable didn't expect.":
    "{0} a renvoyé une réponse que Clodable ne reconnaît pas.",
  "Try again in a minute. If it keeps happening, share the details with your developer.":
    "Réessayez dans une minute. Si le problème persiste, transmettez les détails à votre développeur.",
  "Netlify didn't accept your access token.": "Netlify n’a pas accepté votre token d’accès.",
  "It may have expired or been deleted. Create a new one and connect again.":
    "Il a peut-être expiré ou été supprimé. Créez-en un nouveau et reconnectez-vous.",
  "Netlify refused that.": "Netlify a refusé cette opération.",
  "Netlify refused the request.": "Netlify a refusé la requête.",
  "Netlify isn't connected on this computer yet.":
    "Netlify n’est pas encore connecté sur cet ordinateur.",
  "Connect your Netlify account in the Clodable panel first.":
    "Connectez d’abord votre compte Netlify dans le panneau Clodable.",
  "Couldn't get PostgreSQL's tools, which copying your data needs.":
    "Impossible de récupérer les outils PostgreSQL nécessaires à la copie de vos données.",
  "Couldn't connect to your new database.":
    "Impossible de se connecter à votre nouvelle base de données.",
  "It can take a few minutes after it's created. Try again shortly.":
    "La connexion peut prendre quelques minutes après sa création. Réessayez bientôt.",
  "That file isn't a database export Clodable can read.":
    "Ce fichier n’est pas un export de base de données lisible par Clodable.",
  "Download the export again (from Lovable's email, or More → Cloud → Storage), then try again.":
    "Téléchargez à nouveau l’export depuis l’email de Lovable ou More → Cloud → Storage, puis réessayez.",
  "Couldn't read part of your export.": "Impossible de lire une partie de votre export.",
  "Couldn't read your export's data.": "Impossible de lire les données de votre export.",
  "Couldn't read your export while copying it.":
    "Impossible de lire votre export pendant la copie.",
  "The connection to your new database dropped during the copy.":
    "La connexion à votre nouvelle base de données a été interrompue pendant la copie.",
  "Try again: the copy starts over cleanly on a fresh database.":
    "Réessayez : la copie recommence sur une base de données vide.",
  "Look at your app": "Examiner votre application",
  "Connected on this computer": "Connecté sur cet ordinateur",
  "Connect your Supabase account": "Connecter votre compte Supabase",
  "Create your new backend": "Créer votre nouveau backend",
  "Export your data from Lovable": "Exporter vos données depuis Lovable",
  "Copy it into your new backend": "Les copier dans votre nouveau backend",
  "{0} to add": "{0} à ajouter",
  "Copy your uploaded files": "Copier vos fichiers importés",
  "{0} of {1} copied": "{0} sur {1} copiés",
  "Move your backend functions": "Transférer vos fonctions backend",
  "Try your app on the copy": "Essayer votre application sur la copie",
  "The preview uses your new backend": "L’aperçu utilise votre nouveau backend",
  "The preview still uses Lovable Cloud": "L’aperçu utilise encore Lovable Cloud",
  "Connect your Netlify account": "Connecter votre compte Netlify",
  "Prepare your website": "Préparer votre site web",
  "Set up emails for your users": "Configurer les emails de vos utilisateurs",
  "Skipped for now: no password-reset emails":
    "Étape ignorée : aucun email de réinitialisation de mot de passe",
  "{0}: waiting for its records": "{0} : en attente des enregistrements DNS",
  "Switch off Lovable's services": "Désactiver les services de Lovable",
  "Google sign-in": "connexion avec Google",
  "Skipped: it stays off on your new site":
    "Étape ignorée : la connexion reste désactivée sur votre nouveau site",
  "On your new backend": "Sur votre nouveau backend",
  "Pause changes on your live app": "Mettre en pause les modifications de l’application en ligne",
  "Since {0} UTC": "Depuis {0} UTC",
  "Export your data again": "Exporter à nouveau vos données",
  "Copy it in for good": "Effectuer la copie finale",
  "Go live on your new backend and site": "Mettre en ligne votre nouveau backend et votre site",
  "Live at {0}": "En ligne à l’adresse {0}",
  "Publish puts it live": "Publier permet de le mettre en ligne",
  "Your app's address": "L’adresse de votre application",
  "Finish in Lovable": "Terminer dans Lovable",
  "The checked database functions and webhooks no longer name the old backend":
    "Les fonctions de base de données et webhooks vérifiés ne référencent plus l’ancien backend",
  "The rehearsal notes don't have the expected shape.":
    "Les notes de test n’ont pas la structure attendue.",
  "Include the copy identity from move rehearsal and dated feature observations, with their result, method and evidence. Never include keys or people's data.":
    "Incluez l’identité de la copie fournie par move rehearsal et les observations datées sur les fonctionnalités, avec le résultat, la méthode et les preuves. N’incluez aucune clé ni donnée personnelle.",
  "These notes don't match the current copy.":
    "Ces notes ne correspondent pas à la copie actuelle.",
  "Read the current rehearsal record and check which copy was actually tested. Don't relabel old checks as new ones.":
    "Consultez les notes de test actuelles et vérifiez quelle copie a été testée. Ne présentez pas d’anciens tests comme de nouveaux résultats.",
  "A check's date is outside this copy's lifetime.":
    "La date d’une vérification se situe en dehors de la période d’existence de cette copie.",
  "Use the date the check actually happened, after this copy was made.":
    "Utilisez la date réelle de la vérification, après la création de cette copie.",
  "That Resend key can only send emails.":
    "Cette clé Resend permet uniquement d’envoyer des emails.",
  "Resend didn't accept that key.": "Resend n’a pas accepté cette clé.",
  "Create a key with Full access in Resend (API Keys → Create API Key), then connect again.":
    "Créez une clé avec Full access dans Resend, via API Keys → Create API Key, puis reconnectez-vous.",
  "Resend refused the request.": "Resend a refusé la requête.",
  "Resend isn't connected on this computer yet.":
    "Resend n’est pas encore connecté sur cet ordinateur.",
  "Connect your Resend account in the Clodable panel first.":
    "Connectez d’abord votre compte Resend dans le panneau Clodable.",
  "Clearing the earlier copy": "Suppression de la copie précédente",
  "Turning on your database's extensions": "Activation des extensions de votre base de données",
  "Bringing your people over": "Transfert de vos utilisateurs",
  "Copying your tables": "Copie de vos tables",
  "Putting the access rules back": "Rétablissement des règles d’accès",
  "Copied your data": "Données copiées",
  "{0} parts didn't copy cleanly": "Certaines parties n’ont pas été copiées correctement : {0}",
  "Getting the copy ready": "Préparation de la copie",
  "Got the copy ready": "Copie préparée",
  "Which AI provider?": "Quel fournisseur d’IA ?",
  "One of: {0}.": "Au choix : {0}.",
  "That doesn't look like a {0} key.": "Cette valeur ne ressemble pas à une clé {0}.",
  "Paste the whole key, as the provider shows it once.":
    "Collez la clé complète, telle que le fournisseur l’affiche lors de sa création.",
  "Set up your emails first: your app's own emails go out the same way.":
    "Configurez d’abord vos emails : les emails propres à votre application utiliseront le même service.",
  "Move your backend functions first: the sign-in emails come from auth-email-hook.":
    "Transférez d’abord vos fonctions backend : les emails de connexion sont envoyés par auth-email-hook.",
  "clodable move functions": "clodable move functions",
  "That doesn't look like a Netlify access token.":
    "Cette valeur ne ressemble pas à un token d’accès Netlify.",
  "In Netlify: User settings → Applications → Personal access tokens → New access token.":
    "Dans Netlify : User settings → Applications → Personal access tokens → New access token.",
  "Create your new backend first: the site needs it.":
    "Créez d’abord votre nouveau backend : le site en a besoin.",
  "It's one of the first steps of the move.": "C’est l’une des premières étapes du transfert.",
  "Preparing your website": "Préparation de votre site web",
  "Creating the site": "Création du site",
  "Pointing it at your new backend": "Connexion à votre nouveau backend",
  "Your website is prepared": "Votre site web est préparé",
  "Nothing has been published. Continue the move in the panel.":
    "Rien n’a été publié. Continuez le transfert dans le panneau.",
  "Which Netlify team should the site go in?":
    "Dans quelle équipe Netlify voulez-vous créer le site ?",
  "Netlify didn't accept a name for your site.": "Netlify n’a pas accepté de nom pour votre site.",
  "Try again: Clodable picks another name.": "Réessayez : Clodable choisira un autre nom.",
  "Prepare your website first.": "Préparez d’abord votre site web.",
  "Use capitals, digits and underscores.":
    "Utilisez des majuscules, des chiffres et des tirets bas.",
  "Supabase isn't connected on this computer yet.":
    "Supabase n’est pas encore connecté sur cet ordinateur.",
  "Connect your Supabase account first: it's the first step of the move.":
    "Connectez d’abord votre compte Supabase : c’est la première étape du transfert.",
  "Couldn't reach Supabase.": "Impossible de joindre Supabase.",
  "Your new backend isn't available to this Supabase account.":
    "Ce compte Supabase ne peut pas accéder à votre nouveau backend.",
  "Open Supabase and check the account and project. It may have been removed or your access may have changed. Your live app hasn't changed.":
    "Ouvrez Supabase et vérifiez le compte et le projet. Le projet a peut-être été supprimé ou vos droits ont changé. Votre application en ligne n’a pas changé.",
  "Supabase didn't accept your access token.": "Supabase n’a pas accepté votre token d’accès.",
  "It may have expired or been deleted. Connect your Supabase account again in the Clodable panel.":
    "Il a peut-être expiré ou été supprimé. Reconnectez votre compte Supabase dans le panneau Clodable.",
  "You already run 2 free Supabase projects, the most Supabase allows per person across all your organizations.":
    "Vous utilisez déjà 2 projets Supabase gratuits, la limite par personne pour l’ensemble de vos organisations.",
  "Pause one you don't use in Supabase, or pick an organization on a paid plan, then try again.":
    "Mettez en pause un projet inutilisé dans Supabase, ou choisissez une organisation avec un forfait payant, puis réessayez.",
  "This goes past what your Supabase plan includes.":
    "Cette opération dépasse les limites de votre forfait Supabase.",
  "Check your plan in Supabase (Organization → Billing), then try again.":
    "Vérifiez votre forfait dans Supabase, via Organization → Billing, puis réessayez.",
  "Your Supabase access token is missing a permission: {0}.":
    "Il manque une autorisation à votre token d’accès Supabase : {0}.",
  "Your Supabase access token isn't allowed to do this.":
    "Votre token d’accès Supabase n’autorise pas cette opération.",
  "Create a new token that has it (or a full-access one: “Create legacy token”), then connect again. If the permission is there, your role in the organization may not allow it: ask its owner.":
    "Créez un token avec cette autorisation, ou un token complet via « Create legacy token », puis reconnectez-vous. Si l’autorisation est présente, contactez le propriétaire de l’organisation pour vérifier votre rôle.",
  "Supabase refused the request.": "Supabase a refusé la requête.",
  "Careful or quick?": "Avec précaution ou en une fois ?",
  "clodable move method careful (a pause at the end, nothing lost) or quick (in one go).":
    "clodable move method careful pour une pause finale sans perte, ou quick pour un transfert en une fois.",
  "Your app is live on its new home already.":
    "Votre application est déjà en ligne chez son nouvel hébergeur.",
  "Your live app is paused already: finish the careful way.":
    "Votre application en ligne est déjà en pause : terminez avec la méthode careful.",
  "Or undo the pause in Lovable first, with the line the panel shows.":
    "Vous pouvez aussi annuler la pause dans Lovable avec la commande affichée dans le panneau.",
  "Get the copy and your site on Netlify ready first.":
    "Préparez d’abord la copie et votre site Netlify.",
  "The pause should be as short as possible: everything else is done before it.":
    "La pause doit rester aussi courte que possible : toutes les autres étapes viennent avant.",
  "Going live points your app and its sign-in at it.":
    "La mise en ligne y reliera votre application et la connexion de ses utilisateurs.",
  "Some things on your new backend need a look first.":
    "Certains éléments de votre nouveau backend doivent d’abord être vérifiés.",
  "Ask Claude to run clodable move diagnose.":
    "Demandez à Claude d’exécuter clodable move diagnose.",
  "Pause changes on your live app first.":
    "Mettez d’abord en pause les modifications de votre application en ligne.",
  "Going live comes after the pause and the final copy.":
    "La mise en ligne vient après la pause et la copie finale.",
  "Copy your data in for good first: export again from Lovable, then copy it.":
    "Effectuez d’abord la copie finale : exportez à nouveau depuis Lovable, puis copiez les données.",
  "That copy is what keeps everything written before the pause.":
    "Cette copie conserve toutes les données ajoutées avant la pause.",
  "Switching to your new backend": "Bascule vers votre nouveau backend",
  "Sign-in for real people": "Connexion de vos utilisateurs",
  "Your scheduled jobs": "Vos tâches planifiées",
  "Your app's files": "Les fichiers de votre application",
  "Clodable's settings": "Les paramètres de Clodable",
  "Ready to go live": "Prêt pour la mise en ligne",
  "Publish to put it live at {0}": "Publiez pour mettre le site en ligne à l’adresse {0}",
  "Go live first: Lovable Cloud stays until your app works on its new home.":
    "Mettez d’abord la nouvelle app en ligne. Lovable Cloud reste actif jusqu’à ce qu’elle fonctionne chez son nouvel hébergeur.",
  "All {0} and their {1} are there": "Tout est présent : {0} et {1}",
  "{0} didn't copy fully": "Copie incomplète : {0}",
  "{0} can sign in as before": "Connexion inchangée : {0}",
  "{0} of {1} came over": "Transfert effectué : {0} sur {1}",
  "{0} sign in without a password (Google and the like, or invited).":
    "Connexion sans mot de passe : {0} (Google ou autre service, ou sur invitation).",
  "Every access rule is in place": "Toutes les règles d’accès sont en place",
  "Some access rules are missing": "Certaines règles d’accès manquent",
  "Links between tables and automatic actions are in place":
    "Les liens entre tables et les actions automatiques sont en place",
  "Some links or automatic actions are missing":
    "Certains liens ou certaines actions automatiques manquent",
  "Your app can reach its tables as before": "Votre application accède à ses tables comme avant",
  "Your app can't reach some of its tables":
    "Votre application ne peut pas accéder à certaines tables",
  "New rows will save cleanly": "Les nouvelles lignes pourront être enregistrées correctement",
  "Some counters are behind": "Certains compteurs sont en retard",
  "{0} still call Lovable Cloud": "Appels vers Lovable Cloud encore présents : {0}",
  "Database extensions are on": "Les extensions de la base de données sont activées",
  "Some database extensions are off": "Certaines extensions de la base de données sont désactivées",
  "Some files are missing": "Certains fichiers manquent",
  "Some file folders are missing": "Certains dossiers de fichiers manquent",
  "All {0} are there": "Tout est présent : {0}",
  "{0} ready for your files": "Stockage prêt pour vos fichiers : {0}",
  "{count} package has a critical security issue":
    "{count} dépendance présente une faille critique",
  "{count} packages have a critical security issue":
    "{count} dépendances présentent une faille critique",
  "{count} package has a known security issue": "{count} dépendance présente une faille connue",
  "{count} packages have a known security issue":
    "{count} dépendances présentent une faille connue",
  "Checking it builds": "Vérification du build",
  "Checking packages for security issues": "Recherche de failles dans les dépendances",
  "Looking for exposed secret keys": "Recherche de clés secrètes exposées",
  "{features} uses Lovable's AI. Paste your own OpenRouter, Google Gemini or OpenAI key; Claude connects these features to it.":
    "IA de Lovable : {features}. Collez votre propre clé OpenRouter, Google Gemini ou OpenAI ; Claude adaptera ces fonctionnalités.",
  "Your app uses Lovable's AI. Paste your own OpenRouter, Google Gemini or OpenAI key; Claude connects your app to it.":
    "Votre application utilise l’IA de Lovable. Collez votre propre clé OpenRouter, Google Gemini ou OpenAI ; Claude adaptera votre application.",
  "Emails sent through Lovable: {features}. Connect your own Resend account and domain; Claude switches the sending.":
    "Emails envoyés via Lovable : {features}. Connectez votre compte Resend et votre domaine ; Claude adaptera l’envoi.",
  "Your app sends emails through Lovable. Connect your own Resend account and domain; Claude switches the sending.":
    "Votre application envoie des emails via Lovable. Connectez votre compte Resend et votre domaine ; Claude adaptera l’envoi.",
  "Skipped: these services stop with Lovable: {services}":
    "Étape ignorée : ces services s’arrêtent avec Lovable : {services}",
  "{count} table": "{count} table",
  "{count} tables": "{count} tables",
  "{count} row": "{count} ligne",
  "{count} rows": "{count} lignes",
  "{count} person": "{count} utilisateur",
  "{count} people": "{count} utilisateurs",
  "{count} message": "{count} message",
  "{count} messages": "{count} messages",
  "{count} file": "{count} fichier",
  "{count} files": "{count} fichiers",
  "{count} file folder": "{count} dossier",
  "{count} file folders": "{count} dossiers",
  "{count} database function or webhook": "{count} fonction de base de données ou webhook",
  "{count} database function or webhooks": "{count} fonctions de base de données ou webhooks",
  "{count} database secret": "{count} secret de base de données",
  "{count} database secrets": "{count} secrets de base de données",
  "{count} secret key": "{count} clé secrète",
  "{count} secret keys": "{count} clés secrètes",
  "{count} function": "{count} fonction",
  "{count} functions": "{count} fonctions",
  "{count} setting": "{count} paramètre",
  "{count} settings": "{count} paramètres",
  "{count} backend function": "{count} fonction backend",
  "{count} backend functions": "{count} fonctions backend",
  "just now": "à l’instant",
  "{count} min ago": "il y a {count} min",
  "{count} h ago": "il y a {count} h",
  "yesterday at {time}": "hier à {time}",
  AI: "IA",
  "Apple sign-in": "connexion avec Apple",
  "{provider} sign-in": "connexion avec {provider}",
  "its own emails": "emails de l’application",
  "payments ({provider})": "paiements ({provider})",
  "scheduled jobs": "tâches planifiées",
  uploads: "envoi de fichiers",
  "Nothing beyond its data and its site": "Uniquement ses données et son site",
  emails: "emails",
  "sign-in emails": "emails de connexion",
  "{name}: missing": "{name} : manquant",
  "{name}: wrong access": "{name} : accès incorrect",
  "{name}: {actual} of {expected} rows": "{name} : {actual} lignes sur {expected}",
  "{name}: {actual} of {expected} files": "{name} : {actual} fichiers sur {expected}",
  "access rules in {schema}: {actual} of {expected}":
    "règles d’accès dans {schema} : {actual} sur {expected}",
  "protected tables in {schema}: {actual} of {expected}":
    "tables protégées dans {schema} : {actual} sur {expected}",
  "triggers in {schema}: {actual} of {expected}":
    "triggers dans {schema} : {actual} sur {expected}",
  "links between tables in {schema}: {actual} of {expected}":
    "liens entre les tables dans {schema} : {actual} sur {expected}",
  "the app's triggers on sign-ins and files: {actual} of {expected}":
    "triggers de l’application pour les connexions et les fichiers : {actual} sur {expected}",
  "{table} for {role}: {privileges}": "{table} pour {role} : {privileges}",
  Finishing: "Finalisation",
  "Getting ready": "Préparation",
  "Installing your app's packages": "Installation des dépendances de votre application",
  "Building your site": "Construction de votre site",
  "under a minute so far": "moins d’une minute écoulée",
  "{minutes} min so far": "{minutes} min écoulées",
  "Your host is building it · {time}": "Votre hébergeur prépare le site · {time}",
  "Waiting for GitHub to start the build": "En attente du lancement du build sur GitHub",
  "usually about {minutes} min": "en général, environ {minutes} min",
  "the first one takes a few minutes": "le premier build prend quelques minutes",
  Free: "Gratuit",
  "About $10 a month, added to your Supabase plan":
    "Environ 10 $ par mois, en plus de votre forfait Supabase",
  "Run `clodable move diagnose --fix`.": "Lancez `clodable move diagnose --fix`.",
  "Restore it on its page in Supabase, then look again.":
    "Rétablissez-le depuis sa page Supabase, puis relancez la vérification.",
  "Check its status in Supabase, then look again in a minute.":
    "Vérifiez son état dans Supabase, puis réessayez dans une minute.",
  "Run `clodable move diagnose --fix`: it asks the API to refresh its list of tables.":
    "Lancez `clodable move diagnose --fix` pour actualiser la liste des tables de l’API.",
  "Supabase's default": "la destination par défaut de Supabase",
  "new people must confirm by email, which Supabase's test mailer rarely sends":
    "les nouveaux utilisateurs doivent confirmer leur adresse, mais le service email de test de Supabase envoie rarement ce message",
  never: "jamais",
  "Copying again from a fresh export usually puts it right.":
    "Une nouvelle copie à partir d’un export récent résout généralement le problème.",
  "sign-in links go to {url}": "les liens de connexion mènent à {url}",
  "Nothing went to GitHub. It's in an earlier save that hasn't been sent: a developer needs to take that save back.":
    "Rien n’a été envoyé sur GitHub. La clé se trouve dans un enregistrement précédent qui n’a pas encore été envoyé : un développeur doit annuler cet enregistrement.",
  "Nothing went live. Ask Claude to fix it, then publish again.":
    "Rien n’a été mis en ligne. Demandez à Claude de corriger le problème, puis relancez la publication.",
  "These are dated observations, not a fresh check or proof every feature works. Missing evidence means unknown, not never tested. Earlier-copy observations need checking again after a new copy.":
    "Ces observations sont datées : elles ne constituent ni une nouvelle vérification ni la preuve que toutes les fonctions marchent. L’absence de preuve signifie que l’état est inconnu. Après une nouvelle copie, les observations sur une copie précédente doivent être vérifiées à nouveau.",
  "private folders waiting: {folders}": "dossiers privés en attente : {folders}",
  "{count} too large for your plan": "Fichiers trop volumineux pour votre forfait : {count}",
  "{count} failed": "Échecs : {count}",
  "{bucket}: a copied file differs from the original":
    "{bucket} : un fichier copié diffère de l’original",
  "AWS access key": "Clé d’accès AWS",
  "Google API key": "Clé API Google",
  "Something that looks like a key": "Valeur ressemblant à une clé",
  "OpenAI API key": "Clé API OpenAI",
  "Anthropic API key": "Clé API Anthropic",
  "GitHub token": "Token GitHub",
  "Private key": "Clé privée",
  "SendGrid API key": "Clé API SendGrid",
  "Supabase secret key": "Clé secrète Supabase",
  "Supabase service_role key": "Clé service_role Supabase",
  "Access token": "Token d’accès",
  "Stripe test key": "Clé de test Stripe",
  "Stripe live secret key": "Clé secrète de production Stripe",
  "{features}: it runs on Lovable's AI. You paste a key of your own (OpenRouter, Google Gemini or OpenAI), and Claude points it at it.":
    "IA de Lovable : {features}. Collez votre propre clé OpenRouter, Google Gemini ou OpenAI ; Claude connecte ces fonctions à votre clé.",
  "{features}: they run on Lovable's AI. You paste a key of your own (OpenRouter, Google Gemini or OpenAI), and Claude points them at it.":
    "IA de Lovable : {features}. Collez votre propre clé OpenRouter, Google Gemini ou OpenAI ; Claude connecte ces fonctions à votre clé.",
  "They run on Lovable's AI. You paste a key of your own (OpenRouter, Google Gemini or OpenAI), and Claude points them at it.":
    "Ces fonctions utilisent l’IA de Lovable. Collez votre propre clé OpenRouter, Google Gemini ou OpenAI ; Claude les connecte à votre clé.",
  "{features}: sent through Lovable. You connect a free Resend account and add its records to your domain; Clodable gives your app its own key, and Claude switches the sending.":
    "Emails envoyés via Lovable : {features}. Connectez un compte Resend gratuit et ajoutez ses enregistrements DNS à votre domaine. Clodable crée une clé pour votre application et Claude adapte l’envoi.",
  "They're sent through Lovable. You connect a free Resend account and add its records to your domain; Clodable gives your app its own key, and Claude switches the sending.":
    "Ces emails sont envoyés via Lovable. Connectez un compte Resend gratuit et ajoutez ses enregistrements DNS à votre domaine. Clodable crée une clé pour votre application et Claude adapte l’envoi.",
  "Skipped: {services} stops with Lovable":
    "Étape ignorée. Services qui s’arrêteront avec Lovable : {services}",
  "Skipped: {services} stop with Lovable":
    "Étape ignorée. Services qui s’arrêteront avec Lovable : {services}",
  "Some files selected for saving must stay on this computer.":
    "Certains fichiers sélectionnés pour l’enregistrement doivent rester sur cet ordinateur.",
  "Ask Claude to keep these files local, then try again. Nothing was sent.":
    "Demandez à Claude de conserver ces fichiers sur cet ordinateur, puis réessayez. Rien n’a été envoyé.",
  "Some unsaved work needs checking before setting up saving.":
    "Certains changements locaux doivent être vérifiés avant de configurer l’enregistrement.",
  "Ask Claude to preserve both local versions of these files, then try again.":
    "Demandez à Claude de préserver les deux versions locales de ces fichiers, puis réessayez.",
} as const;

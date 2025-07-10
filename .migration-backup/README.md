# BookSmart

## STRIPE
while creating products must add following metadata
product_type = tokens || subscription
token_amount = 50 // if type is tokens


## DataModels
- all should have default/auto-generated id from supabase
- use id for foreign key
- use enum for type/roles where possible, avoid string comparison
- in User role; models should depend on organizationId, i.e. transaction, bank etc


## Controllers
- in User role; controllers should depend on organizationId, i.e. transaction, bank etc

## Pending
- on web, when user have no organization, then it will navigate user to a route, that is temporary. we have to fix it later on, for better navigation

## Supabase Tables
- id type should be int8 and from setting icon set it to IDENTITY

## TODO
- confirm transaction TYPE again, and also adjust it in case of PLAID ... 
- add STRIPE_PROD_SECRET_KEY on supabase


Plaid Test username.
username: user_good
password: pass_good


1. inside the category drop-down add a thin divider/seperater line
2. upload receipt dialog -> remove icons edit/trash-can -> remove color should be grey ... 
3. iin Add-Transaction, if a person select a file, then he should has option to remove it
4. yellow button always have black text
5. if a transaction has some receipt attch to it, show it in the detail dialog


New feature:
- add transactions from bank statments -> also register the bank first ... 

AI- Startegeiess:
1. send user transaction and business data to AI to get them
2. then for each stratgey, user can discuss with AI about it - just like gpt chating, but with a specific context  about this strategy ... 



1. fix the link to use AI features
2. general AI chat
3. update ai-deduction screen design


4. CPA payout - waiting from terica approval
5. 


fixed or percentage


for meals it is 50%

2027 60%


1. seperate meals and entertamaint from the admin panel
2. implment deduction rules as per excel sheet with more complexity and dynamic range
3. mprove AI strageies card -> move butotn to roght, not a long button
4. Toriana will send us UX and we will entertain ... 